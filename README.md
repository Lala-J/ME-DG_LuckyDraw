# Metaelyon: Lucky Draw

> **Metaelyon Lucky Draw** is a simple, web-based application created to handle a registration-powered, validation-based Lucky Draw system with an array of nifty and customisable features.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup & Deployment](#setup--deployment)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Configure Environment Variables](#2-configure-environment-variables)
  - [3. Build and Start the Containers](#3-build-and-start-the-containers)
  - [4. Verify the Deployment](#4-verify-the-deployment)
- [Security Configuration](#security-configuration)
  - [JWT Secret](#jwt-secret)
  - [Default Admin Password](#default-admin-password)
  - [CORS / Allowed Origins](#cors--allowed-origins)
  - [SSL / HTTPS](#ssl--https)
- [Managing the Application](#managing-the-application)
- [Data Persistence](#data-persistence)

---

## Architecture

The application is composed of two Docker services orchestrated with Docker Compose:

| Service | Image | Internal Port | Description |
|---|---|---|---|
| `luckydraw-frontend` | Built from `frontend/Dockerfile` | `80` | React SPA served via nginx |
| `luckydraw-backend` | Built from `backend/Dockerfile` | `4000` | Express REST API + SQLite |

Nginx (inside the frontend container) acts as a reverse proxy, forwarding `/api/*` and `/uploads/*` requests to the backend container over the internal Docker network. The frontend is the only service exposed to the host.

```
Browser → :80 (nginx) ──/api/*──→ backend:4000 (Express)
                    └─ static   → /usr/share/nginx/html (React build)
```

**Database:** SQLite via `sql.js`, persisted to a named Docker volume (`backend-data`). No separate database container is required.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) v24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2+ (included with Docker Desktop)

No Node.js, npm, or any other tooling is required on the host — everything runs inside the containers.

---

## Setup & Deployment

### 1. Clone the Repository

```bash
git clone https://github.com/Lala-J/ME-DG_LuckyDraw.git
cd ME-DG_LuckyDraw
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example backend/.env
```

Then open `backend/.env` and set the three required variables:

```env
# A cryptographically random secret used to sign JWT tokens.
# Must be at least 32 characters. Generate one with the command below.
JWT_SECRET=very-important-secret-dont-share-thanks

# The password for the built-in admin account.
# Set this before first launch — it is only applied when the database is first initialised.
DEFAULT_ADMIN_PASSWORD=very-important-password-dont-share-thanks

# Comma-separated list of origins that are allowed to make API requests.
# Set this to the URL(s) your users will access the site from.
ALLOWED_ORIGINS=http://localhost

# Leave as production unless running locally for development.
NODE_ENV=production
```

> **Important:** I know this is probably obvious, but I have to say it anyways. The `backend/.env` file is listed in `.gitignore` and must never be committed to source control.

### 3. Build and Start the Containers

```bash
docker compose up -d --build
```

This command builds both images from source and starts the services in the background. On first start, the backend automatically creates and seeds the SQLite database with default configuration and the admin account.

### 4. Verify the Deployment

```bash
# Check that both services are running
docker compose ps

# Tail logs from all services
docker compose logs -f

# Check the backend health endpoint
curl http://localhost/api/health
```

The application will be available at **http://localhost** (or your server's IP / domain).

The admin panel is accessible at **/administrator** — log in with the password you set for `DEFAULT_ADMIN_PASSWORD`.

---

## Security Configuration

### JWT Secret

JWT tokens are used to authenticate admin panel sessions. The `JWT_SECRET` value must be:

- **Random** — do not use a dictionary word or a predictable string.
- **At least 32 Characters** — shorter secrets are rejected at startup.
- **Kept private** — treat it like a password; rotate it if it is ever exposed.

Generate a suitable secret with:

```bash
openssl rand -base64 48
```

If `JWT_SECRET` is not set, the backend will refuse to start entirely.

### Default Admin Password

The `DEFAULT_ADMIN_PASSWORD` is hashed with bcrypt and written to the database only on the **first initialisation** (i.e., when the database file does not yet exist). After that, changing this variable has no effect on an existing deployment.

Recommendations:

- Use a minimum of 12 characters with a mix of uppercase, lowercase, digits, and symbols.
- Change the password through the admin panel after the first login.
- If you need to reset a forgotten password, delete the `backend-data` Docker volume and restart — **this will also delete all registrations and draw results**.

### CORS / Allowed Origins

The `ALLOWED_ORIGINS` variable controls which browser origins are permitted to call the API. Set this to the exact URL(s) your users will use:

```env
# Single origin
ALLOWED_ORIGINS=https://luckydraw.example.com

# Multiple origins (comma-separated, no spaces)
ALLOWED_ORIGINS=https://luckydraw.example.com,https://admin.example.com
```

Leaving this set to `http://localhost` in a production deployment will cause API calls from your real domain to be blocked.

### SSL / HTTPS

> **The application does not include SSL termination out of the box.** The nginx container listens on port `80` (HTTP) only.

For a production or internet-facing deployment, HTTPS is strongly recommended. Choose one of the following approaches:

#### Option A — Reverse Proxy on the Host (Recommended)

Place a reverse proxy such as **nginx**, **Caddy**, or **Traefik** on the host machine in front of the Docker container. These tools can obtain and renew Let's Encrypt certificates automatically.

Example with Caddy (simplest):

```
luckydraw.example.com {
    reverse_proxy localhost:80
}
```

Caddy handles certificate provisioning with zero additional configuration.

#### Option B — Expose HTTPS Directly from the Container

Modify `frontend/nginx.conf` to add a `listen 443 ssl` block and mount your certificate files as Docker volumes. This requires you to manage certificate renewal yourself.

#### Option C — Cloud / Hosting Provider Termination

If the application is deployed behind a load balancer or CDN (AWS ALB, Cloudflare, etc.) that handles TLS termination, no changes to the container are needed. Ensure the `X-Forwarded-Proto` header is forwarded correctly — the nginx config already passes it through to the backend.

**Regardless of which option you choose**, once HTTPS is in use:
- Update `ALLOWED_ORIGINS` to use `https://` URLs.
- Access the admin panel only over HTTPS to prevent token interception.

---

## Managing the Application

```bash
# Stop all services
docker compose down

# Stop and remove volumes (DELETES ALL DATA — registrations, results, uploads)
docker compose down -v

# Rebuild images after a code change
docker compose up -d --build

# View logs for a specific service
docker compose logs -f luckydraw-backend
docker compose logs -f luckydraw-frontend

# Open a shell inside a running container
docker compose exec luckydraw-backend sh
```

---

## Data Persistence

Two named Docker volumes store application data:

| Volume | Mounted at | Contents |
|---|---|---|
| `backend-data` | `/app/data` | SQLite database (`luckydraw.db`) |
| `backend-uploads` | `/app/uploads` | Uploaded logo / asset files |

These volumes survive container restarts and image rebuilds. To back up the database, copy the `luckydraw.db` file out of the volume:

```bash
docker run --rm \
  -v me-dg_luckydraw_backend-data:/data \
  -v "$(pwd)":/backup \
  alpine cp /data/luckydraw.db /backup/luckydraw.db
```

---

© Metaelyon LLC  |  2026 – For Eternity | MIT Licence
