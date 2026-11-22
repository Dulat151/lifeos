# SECURITY.md

| Area | Implementation |
|---|---|
| Passwords | Argon2id (`argon2-cffi`), min 8 chars with letters and digits |
| Sessions | Short-lived JWT access token (30 min) + opaque refresh token (30 days) stored **hashed** in `sessions`; rotated on every refresh; revocable per device; all sessions revoked on password reset, other sessions on password change |
| Cookies | `httpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`; refresh cookie scoped to `/api/v1/auth` |
| CSRF | Double-submit: cookie-authenticated unsafe requests require `X-CSRF-Token` = `lifeos_csrf` cookie; bearer-token requests exempt |
| Authorization | Every endpoint depends on `CurrentUser`; every query filters by `user_id`; `get_owned()` returns 404 for foreign IDs; `ensure_refs_owned()` rejects links to foreign objects (422). Covered by `tests/test_isolation.py` |
| Input validation | Pydantic schemas with lengths, ranges, enums, regex; RRULE and IANA time zones validated; explicit `null` rejected for non-nullable fields on PATCH |
| SQL injection | SQLAlchemy parameterised queries only; no string-built SQL with user input |
| XSS | React escaping; Markdown rendered by `react-markdown` without raw HTML; API sets `X-Content-Type-Options: nosniff`; web sets `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` |
| Rate limiting | Auth endpoints 20/min/IP, AI 20/min/user (Redis; in-memory fallback) |
| Account enumeration | Password reset and friend requests return identical responses for unknown emails |
| One-time tokens | Email verification (48 h) / password reset (2 h): random 48-byte tokens stored as SHA-256 hashes, single use |
| Uploads | Allow-list of MIME types + magic-byte check, size limit (`MAX_UPLOAD_MB`), random storage keys outside the web root, served only through an authenticated owner check with `Content-Disposition: attachment` (inline only for images/PDF) and `nosniff` |
| Secrets | Only in environment variables; `.env` is git-ignored; AI/Google/SMTP/VAPID keys never reach the browser; Google tokens encrypted at rest (Fernet, key derived from `SECRET_KEY`) |
| AI | Server-side calls only; context limited to modules the user allowed; model cannot write data — every proposed change requires explicit confirmation; can be disabled per user |
| Social | Off by default; profiles visible only to friends unless made public; achievements private unless published; blocking hides the profile both ways and stops sharing |
| PWA cache | API responses are never cached by the service worker; only static build assets and the offline page |
| Destructive operations | Account deletion requires the password and typing `DELETE`; restore script requires typing `RESTORE` |
| CORS | Restricted to `CORS_ORIGINS` (normally unused because the browser talks same-origin through the proxy) |

## Reporting
Report vulnerabilities privately to the maintainers; do not open public issues for security problems.

## Before production
Set a strong `SECRET_KEY`, `COOKIE_SECURE=true`, HTTPS at the proxy, restrict server firewall to 80/443, enable backups.
