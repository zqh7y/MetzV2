# Security

How Metz protects accounts and data, what was deliberately fixed, and what is
still weak. Written to be honest rather than reassuring — if you are
evaluating this app, read the "Known gaps" section first.

## Configuration

Everything sensitive comes from environment variables (`.env`, gitignored).
See `.env.example` for the full list.

`FLASK_ENV` decides how the app behaves:

| | `development` | anything else (default) |
|---|---|---|
| Debug / Werkzeug console | on | **off** |
| Session cookie `Secure` flag | off (plain-HTTP localhost) | **on** |
| Weak `FLASK_SECRET_KEY` | allowed | **refuses to start** |
| `1234` verification bypass | allowed | **rejected** |
| Mobile API `X-User-Id` header | accepted (legacy dev builds) | **rejected** |
| Mobile API CORS `*` | allowed | **refuses to start** |

Deploying with `FLASK_ENV` unset is the safe default: you get the hardened
behaviour unless you explicitly ask for development mode.

## Authentication

- Passwords are never stored or verified by this app. Sign-in goes to
  **Firebase Authentication**; we only see the result.
- Signup requires an emailed 4-digit code. Codes expire after 15 minutes,
  allow 6 attempts, and are compared with `hmac.compare_digest`.
- The web app authenticates with a signed Flask session cookie
  (`HttpOnly`, `SameSite=Lax`, `Secure` in production, 30-day lifetime).
- The mobile JSON API authenticates with a **signed token** issued at
  login/verify (`utils/tokens.py`) and sent as `Authorization: Bearer <token>`.
  It is an HMAC-SHA256 of `uid|expiry` using the app secret, so it cannot be
  forged without the secret. Tokens expire after 30 days.

## Authorisation

- Admin status is a property of the user record, checked server-side on every
  admin action (`is_admin`). Ban and delete additionally refuse to act on
  other admins.
- Meeting deletion is allowed only for the creator or an admin.
- Untrusted users' meetings stay `pending` and are invisible until an admin
  approves them.

## Protections in place

| Risk | Mitigation |
|---|---|
| CSRF | Per-session token required on every non-GET request; forms carry a hidden field and `fetch` attaches the header automatically (`templates/base.html`) |
| XSS | Jinja auto-escaping server-side; `sanitize_html` on stored title/description/location; `esc()` applied to every value interpolated into `innerHTML` in `static/home.js` |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| Injected third-party code | Content-Security-Policy limited to the CDNs and tile/map hosts actually used |
| Password brute force | 6 attempts per account and 15 per IP in 5 minutes |
| Signup / email spam | 5 signups per IP per hour; 5 code resends per hour |
| Verification-code guessing | 6 attempts, 15-minute expiry |
| Oversized uploads | `MAX_CONTENT_LENGTH` of 2 MB |
| Session theft via JS | `HttpOnly` cookie |

## Data at rest

Meeting and user fields are encrypted in MySQL using `DATA_ENCRYPTION_KEY`.
Losing that key means losing the data — back it up separately from the
database.

## Known gaps

Be aware of these before treating this as production-grade:

1. **The old secret key is public.** A previous `app.secret_key` and the
   Firebase Web API key were committed to this repo's git history. The history
   has been rewritten, but GitHub still serves orphaned commits by SHA until it
   garbage-collects. Rotate `FLASK_SECRET_KEY` and restrict the Firebase key.
2. **Firebase ID tokens are not signature-verified.** We trust that a
   successful Firebase sign-in happened, then issue our own token. Verifying
   the Firebase JWT with `firebase_admin` would additionally prove recency and
   let you revoke sessions centrally.
3. **Rate limits are per-process and in-memory.** Multiple workers multiply the
   limits, and a restart clears them. Move to Redis before scaling out.
4. **No account recovery, password change, or session revocation.** A leaked
   mobile token stays valid until it expires.
5. **Admins are seeded from a hard-coded email list** in `data.py`. It should
   be data, not code.
6. **No audit log.** Bans, deletions and trust changes leave no trace.
7. **The WebSocket server does no origin check or authentication.** It only
   broadcasts attendee counts, but any page can subscribe.
8. **No automated tests or dependency scanning**, so regressions in any of the
   above would be silent.

## Reporting

Found something? Open a private security advisory on the GitHub repository
rather than a public issue.
