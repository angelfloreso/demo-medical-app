# Security Policy

## Overview

This document describes the security posture of the Medical App API, the vulnerabilities
identified via an OWASP Top 10 review, their severity, and the mitigations implemented.

---

## OWASP Top 10 Findings & Mitigations

### CRITICAL

#### A01 – Broken Access Control
**Finding:** All patient and appointment endpoints were publicly accessible without any
authentication or authorization. Protected Health Information (PHI) including patient name,
age, diagnosis, and treating physician was readable, writable, and deletable by anyone.

**Mitigation:** API key authentication (`X-API-Key` header) is enforced on every PHI
endpoint via FastAPI `Depends`. The key is loaded from the `API_KEY` environment variable.
The `/health` endpoint intentionally remains unauthenticated.

---

#### A07 – Identification and Authentication Failures
**Finding:** Zero authentication was implemented; all endpoints were open.

**Mitigation:** `APIKeyHeader` security scheme enforces key validation before any PHI
handler executes. Invalid or missing keys return HTTP 403.

---

### HIGH

#### A03 – Injection
**Finding:** Free-text fields (`name`, `diagnosis`, `doctor`, `notes`, `date`) had no
length limits or format constraints, enabling resource-exhaustion and potential injection.

**Mitigation:** Pydantic `Field` validators enforce:
- `name`, `doctor`: max 100 characters
- `diagnosis`: max 500 characters
- `notes`: max 1,000 characters
- `age`: integer in range [0, 150]
- `date`: regex `^\d{4}-\d{2}-\d{2}$` (YYYY-MM-DD only)

---

#### A02 – Cryptographic Failures
**Finding:** PHI stored in plain-text in-memory; no HTTPS enforcement at the application layer.

**Mitigation:**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` header instructs
  clients to use HTTPS exclusively.
- Production deployments MUST terminate TLS at the load balancer or reverse proxy (e.g.,
  nginx, AWS ALB) and never expose the app over plain HTTP.
- PHI encryption at rest is a deployment-level requirement (encrypted storage volumes,
  database-level encryption).

---

#### A05 – Security Misconfiguration
**Finding:** No CORS policy, no security headers, internal error detail leakage in 500 responses.

**Mitigations:**
- `SecurityHeadersMiddleware` adds on every response:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy: default-src 'self'`
- `CORSMiddleware` restricts cross-origin access to origins listed in the
  `ALLOWED_ORIGINS` environment variable (empty by default = block all).
- A global exception handler returns a generic message for unhandled errors and logs the
  actual exception server-side only.

---

### MEDIUM

#### A04 – Insecure Design (IDOR via Sequential IDs)
**Finding:** Integer auto-increment IDs allowed attackers to enumerate all patients by
iterating `GET /patients/1`, `/patients/2`, etc.

**Mitigation:** All resource IDs are now UUID4 values generated with `uuid.uuid4()`,
making enumeration computationally infeasible.

---

#### A09 – Security Logging and Monitoring Failures
**Finding:** No audit logging for PHI access or modification (HIPAA requirement).

**Mitigation:** Every PHI endpoint emits a structured JSON audit log entry to stdout
containing: `timestamp`, `action`, `method`, `endpoint`, `resource_id`, and `result`.
In production, route these logs to a SIEM or log aggregation service (e.g., Splunk,
Datadog, AWS CloudWatch).

---

#### A08 – Software and Data Integrity Failures
**Finding:** `requirements.txt` pinned package versions but did not use hash verification.

**Mitigation:** All runtime dependencies are version-pinned. For production deployments,
generate a hash-pinned lockfile:
```bash
pip-compile --generate-hashes requirements.in -o requirements.txt
pip install --require-hashes -r requirements.txt
```

---

### LOW

#### A06 – Vulnerable and Outdated Components
**Finding:** `fastapi==0.111.0` and `uvicorn==0.29.0` should be monitored for CVEs.

**Mitigation:** Subscribe to security advisories for all direct dependencies. Use
`pip-audit` or GitHub Dependabot to detect known vulnerabilities automatically:
```bash
pip install pip-audit
pip-audit -r requirements.txt
```

---

#### A10 – Server-Side Request Forgery (SSRF)
**Finding:** Not applicable — the application makes no outbound HTTP requests.

---

## Rate Limiting

An in-memory sliding-window rate limiter allows a maximum of **60 requests per minute
per source IP**. Exceeding the limit returns HTTP 429. For multi-instance deployments,
replace the in-memory store with a shared cache (e.g., Redis + slowapi).

---

## Environment Variables

| Variable          | Required | Description                                                |
|-------------------|----------|------------------------------------------------------------|
| `API_KEY`         | Yes      | API key for all PHI endpoints. Use a 256-bit random value. |
| `ALLOWED_ORIGINS` | No       | Comma-separated CORS origins. Empty = block all.           |

---

## Reporting a Vulnerability

Please report security vulnerabilities by opening a **private** GitHub Security Advisory
on this repository rather than a public issue.
