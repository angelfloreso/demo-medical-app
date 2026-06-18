# Security Review — Demo Medical Records API

**Date:** 2026-06-18  
**Reviewer:** GitHub Copilot  
**Scope:** Full OWASP Top 10 review of the demo-medical-app Node.js/Express REST API  
**Status:** All identified vulnerabilities have been remediated in this commit.

---

## Executive Summary

A security review was conducted on the Demo Medical Records API, a Node.js/Express application managing sensitive healthcare data including patient records, SSNs, diagnoses, and prescriptions. The initial implementation contained **12 distinct vulnerabilities** spanning 8 of the OWASP Top 10 categories. All findings have been remediated in the final codebase committed here.

Medical applications are subject to strict regulatory requirements (HIPAA, GDPR for health data). Any breach of patient data carries significant legal, financial, and reputational consequences, making thorough security hardening essential.

---

## Findings Summary

| ID  | Severity | OWASP Category | Title |
|-----|----------|----------------|-------|
| F01 | Critical | A03 Injection | SQL Injection via string concatenation in patient search |
| F02 | Critical | A02 Cryptographic Failures | MD5 used for password hashing |
| F03 | Critical | A07 Identification & Authentication Failures | Hardcoded JWT secret |
| F04 | Critical | A01 Broken Access Control | Missing authorization — any user can access any patient |
| F05 | High | A07 Identification & Authentication Failures | JWT tokens never expire |
| F06 | High | A07 Identification & Authentication Failures | No rate limiting on authentication endpoints |
| F07 | High | A02 Cryptographic Failures | Patient SSN stored in plaintext |
| F08 | High | A09 Security Logging & Monitoring Failures | Sensitive PII (SSN, diagnosis) logged to console |
| F09 | Medium | A05 Security Misconfiguration | CORS set to allow all origins (`*`) |
| F10 | Medium | A05 Security Misconfiguration | Stack traces exposed in error responses |
| F11 | Medium | A05 Security Misconfiguration | Missing security headers (no Helmet) |
| F12 | Medium | A03 Injection | No input validation or sanitization on any endpoint |

---

## Detailed Findings & Fixes

### F01 — SQL Injection (Critical) · OWASP A03

**Vulnerable code:**
```javascript
// Patient search — raw string concatenation
const rows = db.query(`SELECT * FROM patients WHERE first_name LIKE '%${name}%'`);
```

**Risk:** An attacker supplying `name='; DROP TABLE patients; --` could destroy data, exfiltrate all records, or bypass access controls entirely. In a medical context this could expose every patient's diagnosis and personal data.

**Fix:** All queries now use parameterized prepared statements via `better-sqlite3`:
```javascript
const stmt = db.prepare("SELECT ... FROM patients WHERE first_name LIKE ? OR last_name LIKE ?");
rows = stmt.all(`%${name}%`, `%${name}%`);
```
Every query in the codebase (auth, patients, prescriptions) uses `?` placeholders — no string concatenation is used anywhere.

---

### F02 — MD5 Password Hashing (Critical) · OWASP A02

**Vulnerable code:**
```javascript
const crypto = require('crypto');
const hash = crypto.createHash('md5').update(password).digest('hex');
```

**Risk:** MD5 is a fast, cryptographically broken hash. Precomputed rainbow tables can crack common passwords in seconds. A database breach would immediately compromise all user credentials, enabling attackers to access patient records.

**Fix:** Replaced with `bcryptjs` at cost factor 12 (deliberately slow, resistant to brute force):
```javascript
const password_hash = await bcrypt.hash(password, 12);
// Verification uses constant-time compare built into bcrypt
const valid = await bcrypt.compare(password, hash);
```

---

### F03 — Hardcoded JWT Secret (Critical) · OWASP A07

**Vulnerable code:**
```javascript
const JWT_SECRET = 'secret123';
const token = jwt.sign(payload, JWT_SECRET);
```

**Risk:** A hardcoded secret committed to source control is effectively public. Anyone with repository access (including historical git history) can forge valid JWT tokens and impersonate any user, including admins.

**Fix:** Secret is loaded exclusively from environment variables, with no default fallback:
```javascript
const payload = jwt.verify(token, process.env.JWT_SECRET);
```
The `.env.example` documents that `JWT_SECRET` must be a randomly generated string of at least 32 characters. The actual `.env` file is gitignored.

---

### F04 — Broken Access Control / IDOR (Critical) · OWASP A01

**Vulnerable code:**
```javascript
// Any authenticated user can fetch any patient by ID
router.get('/:id', authenticate, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  res.json(patient);
});
```

**Risk:** Any authenticated nurse or doctor could enumerate all patient IDs and read every patient's complete medical record — a classic Insecure Direct Object Reference (IDOR). This is a HIPAA violation.

**Fix:** Ownership is enforced on every patient and prescription endpoint:
```javascript
if (req.user.role !== 'admin' && patient.assigned_doctor_id !== req.user.sub) {
  return res.status(403).json({ error: 'Access denied.' });
}
```
Doctors see only their own assigned patients. The list endpoint filters at the database query level (not application level) to prevent over-fetching.

---

### F05 — JWT Tokens Never Expire (High) · OWASP A07

**Vulnerable code:**
```javascript
const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET);
// No expiresIn option — token is valid forever
```

**Risk:** A stolen or leaked token grants permanent access. There is no mechanism to invalidate a compromised session.

**Fix:** Tokens are issued with an 8-hour expiry appropriate for a medical shift:
```javascript
jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'demo-medical-app' });
```

---

### F06 — No Rate Limiting on Auth Endpoints (High) · OWASP A07

**Vulnerable code:**
```javascript
// Login endpoint with no rate limiting — brute force possible
router.post('/login', async (req, res) => { ... });
```

**Risk:** Attackers can make unlimited login attempts to brute-force passwords, especially dangerous since the original code used weak MD5 hashes.

**Fix:** `express-rate-limit` is applied with a strict limit for auth routes and a broader limit for general API routes:
```javascript
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);
```

---

### F07 — Patient SSN Stored in Plaintext (High) · OWASP A02

**Vulnerable code:**
```javascript
// SSN stored as plain text in the database
db.prepare('INSERT INTO patients (..., ssn, ...) VALUES (?, ...)').run(..., ssn, ...);
```

**Risk:** A database breach directly exposes Social Security Numbers — among the most sensitive PII. This is a clear HIPAA violation with significant regulatory penalties.

**Fix:** SSNs are hashed with bcrypt before storage. The raw SSN is never persisted:
```javascript
const ssn_hash = await bcrypt.hash(ssn, 12);
// Column renamed to ssn_hash in schema to make intent clear
```
Note: bcrypt hashing prevents SSN lookup/verification by value; if exact match is needed operationally, a keyed HMAC approach should be used instead. For this demo, hashing is appropriate.

---

### F08 — Sensitive Data in Logs (High) · OWASP A09

**Vulnerable code:**
```javascript
console.log(`Patient created: ${patient.ssn}, diagnosis: ${patient.diagnosis}`);
console.log(`Login attempt for user: ${username}, password: ${password}`);
```

**Risk:** Log files are often shipped to centralized logging systems with weaker access controls than the database. Logging SSNs, diagnoses, or passwords creates a secondary data breach vector and is a HIPAA violation.

**Fix:** Replaced all `console.log` calls with structured Winston logging that contains only non-sensitive operational data:
```javascript
logger.info({ event: 'patient_created', patient_id: id, created_by: req.user.username });
logger.warn({ event: 'login_failed', username });
```
No PII (SSN, diagnosis, passwords, full names) appears in any log statement.

---

### F09 — CORS Allows All Origins (Medium) · OWASP A05

**Vulnerable code:**
```javascript
app.use(cors()); // Equivalent to Access-Control-Allow-Origin: *
```

**Risk:** Any website can make cross-origin requests to the API from a victim's browser, enabling CSRF-style attacks that leverage the victim's credentials.

**Fix:** CORS is restricted to an explicit allowlist loaded from environment configuration:
```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
```

---

### F10 — Stack Traces Exposed in Production (Medium) · OWASP A05

**Vulnerable code:**
```javascript
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});
```

**Risk:** Stack traces reveal internal file paths, library versions, and code structure — valuable reconnaissance for attackers.

**Fix:** Stack traces are only included in non-production environments:
```javascript
app.use((err, req, res, next) => {
  logger.error({ message: err.message, stack: err.stack, path: req.path });
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'An internal error occurred.' : err.message
  });
});
```

---

### F11 — Missing Security Headers (Medium) · OWASP A05

**Vulnerable code:**
```javascript
// No security headers set — default Express behavior
const app = express();
```

**Risk:** Without security headers, the application is vulnerable to clickjacking (missing `X-Frame-Options`), MIME-sniffing attacks (missing `X-Content-Type-Options`), and other browser-based attacks.

**Fix:** `helmet` middleware sets all recommended security headers in one line:
```javascript
app.use(helmet());
```
This sets `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, and others.

---

### F12 — No Input Validation (Medium) · OWASP A03

**Vulnerable code:**
```javascript
// No validation — any input accepted directly
const { username, password, role } = req.body;
db.prepare('INSERT INTO users ...').run(username, password, role);
```

**Risk:** Without validation, attackers can submit malformed data, excessively long strings (denial of service), invalid role values, or malformed dates that could cause application errors or data corruption.

**Fix:** `express-validator` is applied to all endpoints with strict rules:
```javascript
body('username').isAlphanumeric().isLength({ min: 3, max: 30 }).trim().escape(),
body('password').isStrongPassword({ minLength: 12, minNumbers: 1, minSymbols: 1 }),
body('role').isIn(['doctor', 'nurse', 'admin']),
body('ssn').matches(/^\d{3}-\d{2}-\d{4}$/),
```
A centralized `validate` middleware short-circuits requests with validation errors before they reach business logic.

---

## Recommendations for Ongoing Security

### Immediate (before production)
1. **Secret rotation**: Generate a cryptographically random JWT secret (`openssl rand -base64 48`) and store it in a secrets manager (AWS Secrets Manager, HashiCorp Vault), not in `.env` files on disk.
2. **HTTPS only**: Deploy behind TLS. Add `app.set('trust proxy', 1)` if behind a load balancer and enforce HSTS via Helmet.
3. **Database encryption at rest**: Enable SQLite encryption (SQLCipher) or migrate to PostgreSQL with transparent data encryption.
4. **Token revocation**: Implement a token blocklist (Redis) for logout and compromised-token scenarios.

### Short-term
5. **Audit logging**: Send all security-relevant events (login, patient access, prescription creation) to an immutable audit log, separate from application logs, to satisfy HIPAA audit trail requirements.
6. **Dependency scanning**: Add `npm audit` to CI/CD and integrate a tool like Dependabot or Snyk for continuous vulnerability monitoring.
7. **Penetration testing**: Conduct a formal penetration test before handling real patient data.
8. **HIPAA BAA**: Ensure all infrastructure providers have signed a Business Associate Agreement.

### Long-term
9. **Field-level encryption**: Encrypt diagnosis and other sensitive fields at the application layer before storing, so database access alone is insufficient to read sensitive data.
10. **Multi-factor authentication**: Add TOTP/FIDO2 MFA for all clinical staff accounts.
11. **Zero-trust network**: Restrict API access to known IP ranges or VPN for administrative endpoints.
12. **Security training**: Conduct regular OWASP/HIPAA security awareness training for all developers.
