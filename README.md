# LockForge Server

Express.js REST API for **LockForge** — authentication, encrypted vault, security tools, and account management.

**Created by Kunj Patel**

## Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT (access + refresh tokens)
- Argon2id (password hashing)
- AES-256-GCM + PBKDF2 (vault encryption)
- Helmet, CORS, rate limiting
- Nodemailer (email verification & reset)
- PDFKit (vault PDF export)

## Prerequisites

- Node.js 18+
- MongoDB (local instance or MongoDB Atlas)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: `5000`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Access token secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token secret (min 32 chars) |
| `CLIENT_URL` | Frontend URL for CORS (e.g. `http://localhost:5173`) |
| `EMAIL_HOST` | SMTP host (e.g. `smtp.gmail.com`) |
| `EMAIL_PORT` | SMTP port (e.g. `587`) |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASSWORD` | SMTP app password |
| `NODE_ENV` | `development` or `production` |

### 3. Start MongoDB

Make sure MongoDB is running locally, or use a cloud URI in `MONGO_URI`.

### 4. Run the server

**Development** (auto-restart on file changes):

```bash
npm run dev
```

**Production**:

```bash
npm start
```

API base URL: `http://localhost:5000/api/v1`

Health check: `GET http://localhost:5000/api/health`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with `node --watch` |
| `npm start` | Start production server |

## Project Structure

```
server/
├── config/          # Database connection
├── controllers/     # Route handlers
├── middleware/      # Auth, vault lock, validation, errors
├── models/          # Mongoose schemas
├── routes/          # Express route definitions
├── services/        # Token, activity, folder services
├── utils/           # Crypto, email, password strength
├── validators/      # Request validation rules
├── index.js         # App entry point
└── .env.example
```

## API Routes

All routes are prefixed with `/api/v1`.

| Prefix | Description |
|--------|-------------|
| `/public` | Public endpoints (password generator) |
| `/auth` | Register, login, logout, vault unlock, email verify |
| `/users` | Profile, password, master password |
| `/vault` | Credentials CRUD, trash, favorites |
| `/folders` | Folder management |
| `/notes` | Secure notes |
| `/sessions` | Active session management |
| `/activity` | Activity logs |
| `/security` | Security dashboard, password generator |
| `/backup` | Encrypted backup export/import, PDF export |

## Authentication

- **Account password** — hashed with Argon2id; used for login
- **Master password** — derives vault encryption keys via PBKDF2; never stored in plaintext
- **JWT** — Bearer tokens returned on login/register; refresh token support
- **Vault lock** — credentials require vault unlock middleware after login

### Protected request example

```
Authorization: Bearer <access_token>
```

## Security Features

- AES-256-GCM encryption for vault data at rest
- Argon2id for account passwords
- PBKDF2 key derivation from master password
- Rate limiting on all routes
- Helmet security headers
- CORS restricted to `CLIENT_URL`
- Input validation with express-validator
- Activity logging for security events
- Session tracking with revoke support

## Models

| Model | Purpose |
|-------|---------|
| `User` | Account, settings, master password verifier |
| `Credential` | Encrypted login credentials |
| `Folder` | Vault organization |
| `SecureNote` | Encrypted notes |
| `Session` | Active login sessions |
| `ActivityLog` | Audit trail |

## Email (Optional)

Email is used for:

- Account verification
- Password reset

Configure SMTP in `.env`. If email is not configured, related features may fail until credentials are set.

## Development with Client

The React client (`../client`) proxies `/api` to this server during development.

1. Start MongoDB
2. Start server: `npm run dev` (port 5000)
3. Start client: `cd ../client && npm run dev` (port 5173)

## Related

- [Client README](../client/README.md)
- [Project README](../README.md)
