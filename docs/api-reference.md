# Demo Medical App — API Reference

## Table of Contents

1. [Overview](#overview)
   - [Base URL](#base-url)
   - [Authentication](#authentication)
   - [Rate Limits](#rate-limits)
   - [Roles & Permissions](#roles--permissions)
2. [Security Considerations](#security-considerations)
3. [Endpoints](#endpoints)
   - [Authentication](#authentication-endpoints)
     - [POST /api/auth/register](#post-apiauthregister)
     - [POST /api/auth/login](#post-apiauthlogin)
   - [Patients](#patient-endpoints)
     - [GET /api/patients](#get-apipatients)
     - [POST /api/patients](#post-apipatients)
     - [GET /api/patients/search](#get-apipatientssearch)
     - [GET /api/patients/:id](#get-apipatientsid)
     - [PUT /api/patients/:id](#put-apipatientsid)
     - [DELETE /api/patients/:id](#delete-apipatientsid)
   - [Prescriptions](#prescription-endpoints)
     - [POST /api/prescriptions](#post-apiprescriptions)
     - [GET /api/prescriptions/patient/:patientId](#get-apiprescriptionspatientpatientid)
4. [Common Workflows](#common-workflows)
5. [Error Reference](#error-reference)

---

## Overview

### Base URL

```
http://localhost:3000
```

### Authentication

All protected endpoints require a **JWT Bearer token** in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are obtained by calling `POST /api/auth/login`. They:
- Are issued by `demo-medical-app`
- Expire after **8 hours** (aligned to a single medical shift)
- Must be stored securely by the client and re-requested after expiry

### Rate Limits

| Endpoint Group | Limit |
|---|---|
| `/api/auth/*` | 10 requests per 15 minutes |
| All other endpoints | 100 requests per 15 minutes |

Every response includes these headers:

| Header | Description |
|---|---|
| `RateLimit-Limit` | Maximum requests allowed in the window |
| `RateLimit-Remaining` | Requests remaining in the current window |
| `RateLimit-Reset` | Seconds until the rate limit window resets |

When a limit is exceeded, the API returns `429 Too Many Requests`:

```json
{ "error": "Too many requests. Please try again later." }
```

### Roles & Permissions

| Role | Patient Access | Prescriptions | Delete Patients |
|---|---|---|---|
| `doctor` | Own assigned patients only | Own patients only | ❌ |
| `nurse` | Own assigned patients only | Own patients only | ❌ |
| `admin` | All patients | All patients | ✅ |

---

## Security Considerations

### SSN Handling (HIPAA-relevant)

- SSNs submitted to `POST /api/patients` or `PUT /api/patients/:id` are **immediately hashed with bcrypt** before being written to the database.
- **The plaintext SSN is never stored** and is not returned in any API response.
- SSN is a **write-only field**: there is no endpoint to retrieve or compare it after creation.
- Treat SSN values as highly sensitive; transmit only over TLS in production.

### Token Management

- Tokens expire after **8 hours**. Build your client to detect `401 Unauthorized` responses and prompt re-authentication.
- Do not store tokens in `localStorage` in browser contexts; prefer `httpOnly` cookies or secure in-memory storage.
- Tokens contain the user's `userId` and `role`; do not derive authorization decisions solely from token claims on the client side.

### Transport Security

All responses include the following security headers (via Helmet):

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` |
| `X-XSS-Protection` | `0` |
| `Content-Security-Policy` | `default-src 'self'` |

**Always deploy behind HTTPS in production** to ensure the `Strict-Transport-Security` header is honored.

### Access Control

- Doctors and nurses can only access patients where `assigned_doctor_id` matches their own user ID.
- A `403 Forbidden` is returned—not `404`—when a patient exists but the caller lacks access, preserving information about their own patients.
- Only the `admin` role can delete patient records.

---

## Endpoints

### Authentication Endpoints

---

#### POST /api/auth/register

Register a new user account.

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/auth/register` |
| **Auth required** | No |
| **Rate limit** | 10 requests / 15 min |

**Request Body**

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `username` | string | ✅ | Alphanumeric, 3–30 chars | Login username |
| `password` | string | ✅ | Min 12 chars, must include a number and a symbol | Account password |
| `role` | string | ✅ | `"doctor"`, `"nurse"`, or `"admin"` | User role |

**Request Example**

```json
{
  "username": "drjwilliams",
  "password": "Secure#Pass1234",
  "role": "doctor"
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"drjwilliams","password":"Secure#Pass1234","role":"doctor"}'
```

**Response Codes**

| Code | Description |
|---|---|
| `201 Created` | User registered successfully |
| `400 Bad Request` | Validation error |
| `409 Conflict` | Username already exists |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 201**

```json
{
  "message": "User registered.",
  "userId": 7
}
```

**Response Example — 409**

```json
{
  "error": "Username already exists."
}
```

---

#### POST /api/auth/login

Authenticate and receive a JWT token.

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/auth/login` |
| **Auth required** | No |
| **Rate limit** | 10 requests / 15 min |

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `username` | string | ✅ | Registered username |
| `password` | string | ✅ | Account password |

**Request Example**

```json
{
  "username": "drjwilliams",
  "password": "Secure#Pass1234"
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"drjwilliams","password":"Secure#Pass1234"}'
```

**Response Codes**

| Code | Description |
|---|---|
| `200 OK` | Login successful, token returned |
| `401 Unauthorized` | Invalid credentials |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 200**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjcsInJvbGUiOiJkb2N0b3IiLCJpYXQiOjE3MTg3MjAwMDAsImV4cCI6MTcxODc0ODgwMH0.example"
}
```

---

### Patient Endpoints

All patient endpoints require `Authorization: Bearer <token>` and are subject to the general rate limit of **100 requests per 15 minutes**.

---

#### GET /api/patients

List patients accessible to the authenticated user.

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/api/patients` |
| **Auth required** | ✅ Bearer token |
| **Rate limit** | 100 requests / 15 min |
| **Doctor/Nurse** | Own assigned patients only |
| **Admin** | All patients |

**cURL Example**

```bash
curl http://localhost:3000/api/patients \
  -H "Authorization: Bearer <token>"
```

**Response Codes**

| Code | Description |
|---|---|
| `200 OK` | List returned (may be empty array) |
| `401 Unauthorized` | Missing or invalid token |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 200**

```json
[
  {
    "id": 42,
    "first_name": "Margaret",
    "last_name": "Chen",
    "date_of_birth": "1978-04-15",
    "diagnosis": "Type 2 Diabetes Mellitus",
    "assigned_doctor_id": 7,
    "created_at": "2026-06-01T09:23:11.000Z"
  },
  {
    "id": 43,
    "first_name": "Robert",
    "last_name": "Okonkwo",
    "date_of_birth": "1965-11-30",
    "diagnosis": null,
    "assigned_doctor_id": 7,
    "created_at": "2026-06-03T14:10:05.000Z"
  }
]
```

---

#### POST /api/patients

Create a new patient record.

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/patients` |
| **Auth required** | ✅ Bearer token |
| **Rate limit** | 100 requests / 15 min |

**Request Body**

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `first_name` | string | ✅ | 1–100 chars | Patient's first name |
| `last_name` | string | ✅ | 1–100 chars | Patient's last name |
| `date_of_birth` | string | ✅ | ISO 8601 `YYYY-MM-DD` | Date of birth |
| `ssn` | string | ✅ | Format `NNN-NN-NNNN` | Social Security Number — hashed before storage, never returned |
| `diagnosis` | string | ❌ | Max 500 chars | Initial diagnosis |
| `assigned_doctor_id` | integer | ❌ | Admin only | Doctor to assign; defaults to calling user's ID |

**Request Example**

```json
{
  "first_name": "Margaret",
  "last_name": "Chen",
  "date_of_birth": "1978-04-15",
  "ssn": "123-45-6789",
  "diagnosis": "Type 2 Diabetes Mellitus",
  "assigned_doctor_id": 7
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/patients \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Margaret",
    "last_name": "Chen",
    "date_of_birth": "1978-04-15",
    "ssn": "123-45-6789",
    "diagnosis": "Type 2 Diabetes Mellitus"
  }'
```

**Response Codes**

| Code | Description |
|---|---|
| `201 Created` | Patient created |
| `400 Bad Request` | Validation error |
| `401 Unauthorized` | Missing or invalid token |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 201**

```json
{
  "message": "Patient created.",
  "patientId": 42
}
```

---

#### GET /api/patients/search

Search patients by name (case-insensitive substring match).

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/api/patients/search` |
| **Auth required** | ✅ Bearer token |
| **Rate limit** | 100 requests / 15 min |
| **Doctor/Nurse** | Searches own assigned patients only |
| **Admin** | Searches all patients |

> ⚠️ **Routing note:** This path must be resolved before `GET /api/patients/:id` in any client-side router to prevent `search` being treated as a numeric patient ID.

**Query Parameters**

| Parameter | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `name` | string | ✅ | 1–100 chars | Name fragment to match |

**cURL Example**

```bash
curl "http://localhost:3000/api/patients/search?name=chen" \
  -H "Authorization: Bearer <token>"
```

**Response Codes**

| Code | Description |
|---|---|
| `200 OK` | Matching patients (may be empty array) |
| `400 Bad Request` | Invalid or missing `name` parameter |
| `401 Unauthorized` | Missing or invalid token |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 200**

```json
[
  {
    "id": 42,
    "first_name": "Margaret",
    "last_name": "Chen",
    "date_of_birth": "1978-04-15",
    "diagnosis": "Type 2 Diabetes Mellitus",
    "assigned_doctor_id": 7,
    "created_at": "2026-06-01T09:23:11.000Z"
  }
]
```

---

#### GET /api/patients/:id

Retrieve a single patient by ID.

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/api/patients/:id` |
| **Auth required** | ✅ Bearer token |
| **Rate limit** | 100 requests / 15 min |

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `id` | integer | Patient ID |

**cURL Example**

```bash
curl http://localhost:3000/api/patients/42 \
  -H "Authorization: Bearer <token>"
```

**Response Codes**

| Code | Description |
|---|---|
| `200 OK` | Patient record returned |
| `401 Unauthorized` | Missing or invalid token |
| `403 Forbidden` | Patient exists but not accessible to calling user |
| `404 Not Found` | Patient does not exist |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 200**

```json
{
  "id": 42,
  "first_name": "Margaret",
  "last_name": "Chen",
  "date_of_birth": "1978-04-15",
  "diagnosis": "Type 2 Diabetes Mellitus",
  "assigned_doctor_id": 7,
  "created_at": "2026-06-01T09:23:11.000Z"
}
```

---

#### PUT /api/patients/:id

Partially update a patient record. All fields are optional; at least one must be provided.

| | |
|---|---|
| **Method** | `PUT` |
| **Path** | `/api/patients/:id` |
| **Auth required** | ✅ Bearer token |
| **Rate limit** | 100 requests / 15 min |

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `id` | integer | Patient ID |

**Request Body** (all fields optional)

| Field | Type | Constraints | Description |
|---|---|---|---|
| `first_name` | string | 1–100 chars | Updated first name |
| `last_name` | string | 1–100 chars | Updated last name |
| `date_of_birth` | string | ISO 8601 `YYYY-MM-DD` | Updated date of birth |
| `diagnosis` | string | Max 500 chars | Updated diagnosis |
| `ssn` | string | Format `NNN-NN-NNNN` | New SSN — re-hashed before storage |

**Request Example**

```json
{
  "diagnosis": "Type 2 Diabetes Mellitus, Hypertension"
}
```

**cURL Example**

```bash
curl -X PUT http://localhost:3000/api/patients/42 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"diagnosis": "Type 2 Diabetes Mellitus, Hypertension"}'
```

**Response Codes**

| Code | Description |
|---|---|
| `200 OK` | Patient updated |
| `400 Bad Request` | No valid fields provided |
| `401 Unauthorized` | Missing or invalid token |
| `403 Forbidden` | Access denied |
| `404 Not Found` | Patient does not exist |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 200**

```json
{
  "message": "Patient updated."
}
```

**Response Example — 400**

```json
{
  "error": "No valid fields to update."
}
```

---

#### DELETE /api/patients/:id

Permanently delete a patient record. **Admin role required.**

| | |
|---|---|
| **Method** | `DELETE` |
| **Path** | `/api/patients/:id` |
| **Auth required** | ✅ Bearer token (admin only) |
| **Rate limit** | 100 requests / 15 min |

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `id` | integer | Patient ID |

**cURL Example**

```bash
curl -X DELETE http://localhost:3000/api/patients/42 \
  -H "Authorization: Bearer <admin-token>"
```

**Response Codes**

| Code | Description |
|---|---|
| `200 OK` | Patient deleted |
| `401 Unauthorized` | Missing or invalid token |
| `403 Forbidden` | Admin role required |
| `404 Not Found` | Patient does not exist |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 200**

```json
{
  "message": "Patient deleted."
}
```

**Response Example — 403**

```json
{
  "error": "Admin role required."
}
```

---

### Prescription Endpoints

All prescription endpoints require `Authorization: Bearer <token>` and are subject to the general rate limit of **100 requests per 15 minutes**.

---

#### POST /api/prescriptions

Create a prescription for a patient.

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/prescriptions` |
| **Auth required** | ✅ Bearer token |
| **Rate limit** | 100 requests / 15 min |

The calling user must be the assigned doctor for the patient, or have `admin` role. The prescription is recorded with the calling user's ID as `doctor_id`.

**Request Body**

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `patient_id` | integer | ✅ | — | ID of the patient |
| `medication` | string | ✅ | 1–200 chars | Medication name |
| `dosage` | string | ✅ | 1–100 chars | Dosage instructions |

**Request Example**

```json
{
  "patient_id": 42,
  "medication": "Metformin",
  "dosage": "500mg twice daily"
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/prescriptions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"patient_id": 42, "medication": "Metformin", "dosage": "500mg twice daily"}'
```

**Response Codes**

| Code | Description |
|---|---|
| `201 Created` | Prescription created |
| `400 Bad Request` | Validation error |
| `401 Unauthorized` | Missing or invalid token |
| `403 Forbidden` | Not assigned to patient |
| `404 Not Found` | Patient not found |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 201**

```json
{
  "message": "Prescription created.",
  "prescriptionId": 15
}
```

---

#### GET /api/prescriptions/patient/:patientId

List all prescriptions for a given patient.

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/api/prescriptions/patient/:patientId` |
| **Auth required** | ✅ Bearer token |
| **Rate limit** | 100 requests / 15 min |

**Path Parameters**

| Parameter | Type | Description |
|---|---|---|
| `patientId` | integer | Patient ID |

**cURL Example**

```bash
curl http://localhost:3000/api/prescriptions/patient/42 \
  -H "Authorization: Bearer <token>"
```

**Response Codes**

| Code | Description |
|---|---|
| `200 OK` | List of prescriptions (may be empty) |
| `401 Unauthorized` | Missing or invalid token |
| `403 Forbidden` | Not assigned to patient |
| `404 Not Found` | Patient not found |
| `429 Too Many Requests` | Rate limit exceeded |

**Response Example — 200**

```json
[
  {
    "id": 15,
    "patient_id": 42,
    "doctor_id": 7,
    "medication": "Metformin",
    "dosage": "500mg twice daily",
    "created_at": "2026-06-01T10:05:33.000Z"
  },
  {
    "id": 16,
    "patient_id": 42,
    "doctor_id": 7,
    "medication": "Lisinopril",
    "dosage": "10mg once daily",
    "created_at": "2026-06-15T08:30:00.000Z"
  }
]
```

---

## Common Workflows

### Workflow 1: Register a User and Login

**Step 1 — Register**

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "drjwilliams",
    "password": "Secure#Pass1234",
    "role": "doctor"
  }'
```

Response:
```json
{ "message": "User registered.", "userId": 7 }
```

**Step 2 — Login**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "drjwilliams",
    "password": "Secure#Pass1234"
  }'
```

Response:
```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

Store the token value for use in subsequent requests.

---

### Workflow 2: Create a Patient and Add a Prescription (as a Doctor)

**Step 1 — Create the patient**

```bash
curl -X POST http://localhost:3000/api/patients \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Margaret",
    "last_name": "Chen",
    "date_of_birth": "1978-04-15",
    "ssn": "123-45-6789",
    "diagnosis": "Type 2 Diabetes Mellitus"
  }'
```

Response:
```json
{ "message": "Patient created.", "patientId": 42 }
```

> The patient is automatically assigned to the calling doctor (`assigned_doctor_id` = your user ID).

**Step 2 — Create a prescription**

```bash
curl -X POST http://localhost:3000/api/prescriptions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": 42,
    "medication": "Metformin",
    "dosage": "500mg twice daily"
  }'
```

Response:
```json
{ "message": "Prescription created.", "prescriptionId": 15 }
```

**Step 3 — Verify the prescription**

```bash
curl http://localhost:3000/api/prescriptions/patient/42 \
  -H "Authorization: Bearer <token>"
```

---

### Workflow 3: Search for Patients (as Admin)

**Step 1 — Login as admin**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"adminuser","password":"Admin#Secure9876"}'
```

**Step 2 — Search patients by name**

```bash
curl "http://localhost:3000/api/patients/search?name=chen" \
  -H "Authorization: Bearer <admin-token>"
```

Response:
```json
[
  {
    "id": 42,
    "first_name": "Margaret",
    "last_name": "Chen",
    "date_of_birth": "1978-04-15",
    "diagnosis": "Type 2 Diabetes Mellitus",
    "assigned_doctor_id": 7,
    "created_at": "2026-06-01T09:23:11.000Z"
  }
]
```

**Step 3 — (Optional) List all patients**

```bash
curl http://localhost:3000/api/patients \
  -H "Authorization: Bearer <admin-token>"
```

---

## Error Reference

### Standard Error Format

All error responses return a JSON object:

```json
{ "error": "Human-readable error message." }
```

Validation errors return:

```json
{
  "errors": [
    {
      "msg": "Password must be at least 12 characters",
      "param": "password",
      "location": "body"
    }
  ]
}
```

### Error Code Table

| HTTP Code | Condition | Example Body |
|---|---|---|
| `400 Bad Request` | Missing/invalid request fields | `{"errors": [{"msg": "...", "param": "...", "location": "body"}]}` |
| `400 Bad Request` | No valid fields in PUT body | `{"error": "No valid fields to update."}` |
| `401 Unauthorized` | Missing or expired JWT | `{"error": "No token provided."}` |
| `403 Forbidden` | Patient not assigned to caller | `{"error": "Access denied."}` |
| `403 Forbidden` | Non-admin attempting delete | `{"error": "Admin role required."}` |
| `404 Not Found` | Patient ID does not exist | `{"error": "Patient not found."}` |
| `404 Not Found` | Patient not found for prescription | `{"error": "Patient not found."}` |
| `409 Conflict` | Username taken during register | `{"error": "Username already exists."}` |
| `429 Too Many Requests` | Rate limit exceeded | `{"error": "Too many requests. Please try again later."}` |
