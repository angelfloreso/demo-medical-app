# Demo Medical App — Usage Guide & Workflows

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication Flow](#authentication-flow)
3. [Doctor Workflow](#doctor-workflow)
4. [Admin Workflow](#admin-workflow)
5. [Rate Limiting Guidance](#rate-limiting-guidance)
6. [Security Best Practices](#security-best-practices)

---

## Getting Started

### Prerequisites

- `curl` (or any HTTP client)
- The API running at `http://localhost:3000`

### Quick Start

The following three commands will register an account, log in, and list your patients:

```bash
# 1. Register a doctor account
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"drjwilliams","password":"Secure#Pass1234","role":"doctor"}'

# 2. Login and capture the token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"drjwilliams","password":"Secure#Pass1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 3. List your patients
curl http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN"
```

---

## Authentication Flow

### Obtaining a Token

Call `POST /api/auth/login` with valid credentials:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"drjwilliams","password":"Secure#Pass1234"}'
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Using the Token

Include the token in the `Authorization` header of every protected request:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Expiry and Refresh

Tokens expire after **8 hours** (one medical shift). There is no refresh endpoint — you must re-authenticate with credentials.

**Recommended pattern:**

1. On receiving a `401 Unauthorized` response, redirect the user to the login screen.
2. After successful re-login, retry the original request with the new token.
3. Store the token in memory (not `localStorage`) and track its issue time to proactively re-authenticate before expiry.

```bash
# Example: detect expiry and re-authenticate
RESPONSE=$(curl -s -o response.json -w "%{http_code}" \
  http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN")

if [ "$RESPONSE" = "401" ]; then
  echo "Token expired — re-authenticating..."
  TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"drjwilliams","password":"Secure#Pass1234"}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
fi
```

### Auth Rate Limit

The login and register endpoints are limited to **10 requests per 15 minutes**. Avoid retry loops on authentication failures to prevent lockout.

---

## Doctor Workflow

A complete end-to-end workflow for a doctor to register, log in, manage patients, and prescribe medications.

### Step 1 — Register

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "drjwilliams",
    "password": "Secure#Pass1234",
    "role": "doctor"
  }'
```

```json
{ "message": "User registered.", "userId": 7 }
```

### Step 2 — Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "drjwilliams", "password": "Secure#Pass1234"}'
```

```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

Save the token as `TOKEN` for the following steps.

### Step 3 — Create a Patient

```bash
curl -X POST http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Margaret",
    "last_name": "Chen",
    "date_of_birth": "1978-04-15",
    "ssn": "123-45-6789",
    "diagnosis": "Type 2 Diabetes Mellitus"
  }'
```

```json
{ "message": "Patient created.", "patientId": 42 }
```

> The patient is automatically assigned to you (`assigned_doctor_id` = your user ID).

### Step 4 — View Your Patients

```bash
curl http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN"
```

### Step 5 — Update a Diagnosis

```bash
curl -X PUT http://localhost:3000/api/patients/42 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"diagnosis": "Type 2 Diabetes Mellitus, Hypertension"}'
```

```json
{ "message": "Patient updated." }
```

### Step 6 — Prescribe a Medication

```bash
curl -X POST http://localhost:3000/api/prescriptions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": 42,
    "medication": "Metformin",
    "dosage": "500mg twice daily"
  }'
```

```json
{ "message": "Prescription created.", "prescriptionId": 15 }
```

### Step 7 — Review All Prescriptions for a Patient

```bash
curl http://localhost:3000/api/prescriptions/patient/42 \
  -H "Authorization: Bearer $TOKEN"
```

```json
[
  {
    "id": 15,
    "patient_id": 42,
    "doctor_id": 7,
    "medication": "Metformin",
    "dosage": "500mg twice daily",
    "created_at": "2026-06-01T10:05:33.000Z"
  }
]
```

---

## Admin Workflow

An admin can access all patients across the system and is the only role that can delete patient records.

### Step 1 — Login as Admin

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "adminuser", "password": "Admin#Secure9876"}'
```

Save the token as `ADMIN_TOKEN`.

### Step 2 — List All Patients

```bash
curl http://localhost:3000/api/patients \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

All patients in the system are returned, regardless of which doctor they are assigned to.

### Step 3 — Search for a Patient

```bash
curl "http://localhost:3000/api/patients/search?name=chen" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Case-insensitive search against both first and last name fields.

### Step 4 — Retrieve a Specific Patient

```bash
curl http://localhost:3000/api/patients/42 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Step 5 — Assign a Patient to a Different Doctor

```bash
curl -X PUT http://localhost:3000/api/patients/42 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assigned_doctor_id": 12}'
```

> Only admins can update `assigned_doctor_id`.

### Step 6 — Delete a Patient Record

```bash
curl -X DELETE http://localhost:3000/api/patients/42 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

```json
{ "message": "Patient deleted." }
```

> ⚠️ Deletion is permanent and removes all associated records.

---

## Rate Limiting Guidance

### Understanding Limits

| Endpoint Group | Limit | Window |
|---|---|---|
| `/api/auth/*` | 10 requests | 15 minutes |
| All other endpoints | 100 requests | 15 minutes |

Check the response headers after each request:

```
RateLimit-Limit: 100
RateLimit-Remaining: 87
RateLimit-Reset: 423
```

`RateLimit-Reset` is the number of seconds until your current window resets.

### Handling 429 Responses

When you receive a `429 Too Many Requests`:

```json
{ "error": "Too many requests. Please try again later." }
```

**Do not retry immediately.** Use the `RateLimit-Reset` header to determine how long to wait:

```bash
RESET_SECONDS=$(curl -sI http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN" \
  | grep -i "ratelimit-reset" | awk '{print $2}' | tr -d '\r')

echo "Rate limited. Waiting ${RESET_SECONDS} seconds..."
sleep "$RESET_SECONDS"
```

### Exponential Backoff Strategy

For automated clients, implement exponential backoff with jitter on `429` responses:

```python
import time
import random
import requests

def request_with_backoff(url, headers, max_retries=5):
    for attempt in range(max_retries):
        response = requests.get(url, headers=headers)
        if response.status_code != 429:
            return response
        reset = int(response.headers.get("RateLimit-Reset", 60))
        wait = reset + random.uniform(0, 2)  # add jitter
        print(f"Rate limited. Retrying in {wait:.1f}s (attempt {attempt + 1})")
        time.sleep(wait)
    raise Exception("Max retries exceeded")
```

### Tips to Avoid Rate Limits

- **Batch reads**: Fetch patient lists once and filter client-side rather than making individual `GET /api/patients/:id` calls in a loop.
- **Cache tokens**: Re-use a valid token for its full 8-hour lifetime. Don't re-authenticate before every request.
- **Avoid polling**: Don't repeatedly call the API to check for changes; request data only when needed.

---

## Security Best Practices

### Token Storage

| Context | Recommendation |
|---|---|
| Server-side (Node.js, Python) | Environment variable or secrets manager |
| Browser (SPA) | `httpOnly` cookie or in-memory variable — **never `localStorage`** |
| Mobile app | Secure keychain/keystore (iOS Keychain, Android Keystore) |
| Scripts / automation | Environment variable; never hard-code in source files |

### Credential Hygiene

- Use strong, unique passwords (the API enforces min 12 chars with numbers and symbols).
- Never commit credentials or tokens to version control.
- Rotate admin credentials regularly.
- Each user (doctor, nurse) should have their own account — do not share credentials.

### Network Security

- Always deploy behind **HTTPS/TLS** in production. The API returns a `Strict-Transport-Security` header that browsers will enforce.
- Restrict API access to internal networks or VPN where possible — avoid exposing the API directly to the public internet.
- Validate that your TLS certificate is valid and up-to-date.

### SSN and PHI Handling

- SSNs are **write-only**: they are hashed with bcrypt and can never be retrieved via the API.
- Minimize client-side handling of SSNs: submit them directly in the request and discard immediately after.
- Treat all patient data as Protected Health Information (PHI) in compliance with HIPAA. Log access appropriately and restrict access to authorized personnel only.
- Do not log request bodies that contain `ssn` fields.

### Input Validation

The API validates all inputs server-side. Clients should also validate before sending to reduce round-trips and avoid accidental submission of malformed data:

- `date_of_birth`: must be `YYYY-MM-DD` and a valid calendar date
- `ssn`: must match `NNN-NN-NNNN` pattern
- `username`: alphanumeric only, 3–30 characters
- `password`: minimum 12 characters, at least one digit and one symbol

### Audit and Monitoring

- All patient and prescription operations include a `created_at` timestamp.
- For production deployments, implement server-side access logging to maintain an audit trail (required for HIPAA compliance).
- Monitor for repeated `401` and `403` responses, which may indicate unauthorized access attempts.
- Alert on sustained `429` responses from a single IP, which may indicate scraping or abuse.
