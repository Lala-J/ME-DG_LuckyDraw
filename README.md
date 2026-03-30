# Metaelyon: Lucky Draw

> **Metaelyon Lucky Draw** is a web-based application for a registration-powered, validation-based Lucky Draw system with customisable branding, prize pools, and optional Microsoft 365 single-sign-on registration.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup & Deployment](#setup--deployment)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Configure Environment Variables](#2-configure-environment-variables)
  - [3. Build and Start the Containers](#3-build-and-start-the-containers)
- [Security Configuration](#security-configuration)
  - [JWT Secret](#jwt-secret)
  - [Default Admin Password](#default-admin-password)
  - [DEFAULT_SECURITY_POLICY](#default_security_policy)
  - [CORS / Allowed Origins](#cors--allowed-origins)
  - [SSL / HTTPS](#ssl--https)
- [Microsoft 365 Registration (Azure Graph API)](#microsoft-365-registration-azure-graph-api)
  - [Azure App Registration](#azure-app-registration)
  - [Field Mapping](#field-mapping)
- [Managing the Application](#managing-the-application)
- [Data Persistence](#data-persistence)

---

## Architecture

| Service | Image | Internal Port | Description |
|---|---|---|---|
| `luckydraw-frontend` | Built from `frontend/Dockerfile` | `80` | React SPA served via nginx |
| `luckydraw-backend` | Built from `backend/Dockerfile` | `4000` | Express REST API + SQLite |

Nginx (inside the frontend container) reverse-proxies `/api/*` and `/uploads/*` to the backend container. The frontend container is the only service exposed to the host, on the port set by `APPLICATION_PORT`.

```
Browser → :APPLICATION_PORT (nginx) ──/api/*──→ backend:4000 (Express)
                              └─ static       → /usr/share/nginx/html (React build)
```

**Database:** SQLite via `sql.js`, persisted to a named Docker volume (`backend-data`).

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) v24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2+

---

## Setup & Deployment

### 1. Clone the Repository

```bash
git clone https://github.com/Lala-J/ME-DG_LuckyDraw.git
cd ME-DG_LuckyDraw
```

### 2. Configure Environment Variables

```bash
cp .env.example backend/.env
```

Open `backend/.env` and configure the following:

```env
# Signs admin session JWTs. Generate with: openssl rand -base64 48
JWT_SECRET=

# Applied only on first database initialisation. Has no effect on existing deployments.
DEFAULT_ADMIN_PASSWORD=

# Comma-separated list of origins permitted to call the API (no spaces).
ALLOWED_ORIGINS=https://luckydraw.example.com

# Host port the nginx container binds to.
APPLICATION_PORT=8900

# Prevents startup if ALLOWED_ORIGINS or AZURE_REDIRECT_URI use HTTP in production.
# Also enables the HSTS header. Set to false only for local dev or when you're
# certain HTTPS is enforced upstream.
DEFAULT_SECURITY_POLICY=true

# --- Optional: Microsoft 365 registration via Azure Graph API ---
# Leave all four blank to disable the feature (the Sign in with Microsoft
# button will return a graceful error to the user).
AZURE_CLIENT_ID=
AZURE_TENANT_ID=
AZURE_CLIENT_SECRET=
AZURE_REDIRECT_URI=https://luckydraw.example.com/api/auth/microsoft/callback
```

### 3. Build and Start the Containers

```bash
docker compose up -d --build
```

The admin panel is at **/administrator**.

---

## Security Configuration

### JWT Secret

Admin sessions are issued as signed JWTs and delivered to the browser as an **HttpOnly; Secure; SameSite=Strict** cookie. The token is never readable by JavaScript. Sessions expire after 6 hours and are invalidated server-side on logout and on password change.

The backend refuses to start if `JWT_SECRET` is not set.

### Default Admin Password

`DEFAULT_ADMIN_PASSWORD` is bcrypt-hashed and written to the database only on **first initialisation**. Once the database exists, changing this variable has no effect. To reset a forgotten password, delete the `backend-data` volume and restart — **this also deletes all registrations and draw results**.

The minimum accepted password length is 12 characters.

### DEFAULT_SECURITY_POLICY

When set to `true` (the default), the backend enforces the following at startup in any environment where `NODE_ENV` is not `development`:

- Every origin in `ALLOWED_ORIGINS` must use `https://` (localhost and 127.0.0.1 are exempt).
- `AZURE_REDIRECT_URI`, if set, must use `https://`.

If either condition is not met, the backend exits with a descriptive error rather than starting insecurely.

Setting `DEFAULT_SECURITY_POLICY=true` also enables the **HSTS header** (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`) on all responses. This requires your reverse proxy to be terminating HTTPS — the header has no effect otherwise.

Set to `false` only for local development or when HTTPS enforcement is handled at a layer that doesn't require the application to know about it.

### CORS / Allowed Origins

`ALLOWED_ORIGINS` is a comma-separated list with no spaces. Set it to the exact URL(s) your users will access the application from:

```env
ALLOWED_ORIGINS=https://luckydraw.example.com
# or multiple:
ALLOWED_ORIGINS=https://luckydraw.example.com,https://admin.example.com
```

### SSL / HTTPS

The application does not include SSL termination. The nginx container listens on HTTP only; TLS must be handled upstream.

**Option A — Host reverse proxy (recommended):** Place nginx, Caddy, or Traefik on the host in front of `APPLICATION_PORT`. Caddy handles certificate provisioning automatically:

```
luckydraw.example.com {
    reverse_proxy localhost:8900
}
```

**Option B — Cloud/CDN TLS termination:** Deploy behind an AWS ALB, Cloudflare proxy, or equivalent. No container changes needed; the nginx config already forwards `X-Forwarded-Proto` to the backend.

---

## Microsoft 365 Registration (Azure Graph API)

When configured, the registration page shows a **Sign in with Microsoft** button. The entire OAuth flow runs server-side — no access tokens, Graph API responses, or user profile data are ever forwarded to the browser. The browser receives only an opaque, single-use, 60-second JWT that encodes success or an error code.

On a successful sign-in, the user's profile data is validated against the Validation Table and the registration is recorded using the data from the Validation Table — not from Graph API.

### Azure App Registration

1. Create an App Registration in [Entra ID](https://entra.microsoft.com).
2. Under **Authentication**, add a Redirect URI of type **Web**:
   ```
   https://yourdomain.com/api/auth/microsoft/callback
   ```
   This must exactly match `AZURE_REDIRECT_URI` in your `.env`.
3. Under **API permissions**, add a **Delegated** permission: `User.Read`.
4. Generate a **Client Secret** under **Certificates & secrets**.
5. Copy the **Application (client) ID**, **Directory (tenant) ID**, and the client secret value into your `.env`.

If any of the four Azure variables are missing, the feature is disabled at runtime and the button returns a graceful error — no server crash occurs.

### Field Mapping

By default, the backend maps:

| Graph field | Registration field |
|---|---|
| `displayName` | Full Name |
| `mobilePhone` | Phone Number |

To use different Graph fields, edit `backend/routes/auth.js` at the two lines marked `FIELD MAPPING` (around line 206) and update the `$select` query on the line above them accordingly. The required Graph API scope may also need to be updated depending on which fields you add.

---

## Managing the Application

```bash
# Stop all services
docker compose down

# Stop and remove volumes (DELETES ALL DATA)
docker compose down -v

# Rebuild after a code change
docker compose up -d --build

# Tail logs
docker compose logs -f luckydraw-backend
docker compose logs -f luckydraw-frontend

# Shell into a container
docker compose exec luckydraw-backend sh
```

---

## Data Persistence

| Volume | Mounted at | Contents |
|---|---|---|
| `backend-data` | `/app/data` | SQLite database (`luckydraw.db`) |
| `backend-uploads` | `/app/uploads` | Uploaded logo and asset files |

To back up the database:

```bash
docker run --rm \
  -v me-dg_luckydraw_backend-data:/data \
  -v "$(pwd)":/backup \
  alpine cp /data/luckydraw.db /backup/luckydraw.db
```

---

© Metaelyon LLC | 2026 – For Eternity | MIT Licence
