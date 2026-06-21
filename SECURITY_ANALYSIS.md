# Security Analysis — Student Portal

This document describes the security controls implemented in the Student Portal
application, the threats they mitigate, and known limitations. It is written to
support a structured security assessment of the codebase.

## 1. Authentication Mechanisms

- **Credential storage:** Passwords are never stored in plaintext. They are hashed
  with `bcrypt` (cost factor `12`) before being written to the `students` table
  (`routes/auth.js`, `db/init.js`). Bcrypt is adaptive (salted, slow-by-design),
  which resists both rainbow-table and brute-force attacks compared to fast
  general-purpose hashes (MD5/SHA-256).
- **Login flow:** `POST /login` looks up the student by email, then uses
  `bcrypt.compareSync` to verify the submitted password against the stored hash.
  A generic "Invalid email or password" message is returned on any failure, so
  the app does not reveal whether a given email is registered (mitigates
  user/account enumeration).
- **Timing consistency:** When the submitted email doesn't match any account, the
  app still runs a bcrypt comparison against a precomputed dummy hash
  (`DUMMY_HASH` in `routes/auth.js`) rather than short-circuiting immediately.
  This keeps response time for "unknown email" closer to "wrong password",
  reducing the reliability of a timing side-channel for account enumeration.
- **Rate limiting:** `POST /login` and `POST /register` are throttled per-IP via
  `express-rate-limit` (10 requests / 15 minutes) to slow down automated
  credential-stuffing / brute-force attempts.
- **Session fixation prevention:** On both successful login and successful
  registration, `req.session.regenerate()` is called before the session is
  marked authenticated. This issues a brand-new session ID at the point of
  privilege change, so an attacker cannot pre-set a victim's session ID before
  login and then hijack the now-authenticated session.

## 2. Authorization Controls

- **Route protection middleware:** `middleware/auth.js` exports `requireAuth`,
  which is applied to every route that should only be reachable by a logged-in
  student (`/dashboard`, `/profile`, `/courses`, `/courses/enroll`, `/grades`,
  `/fees`, `/fees/pay`, `POST /profile`, `POST /logout`). Unauthenticated
  requests are redirected to `/login` rather than served any protected content.
- **Object-level scoping:** All queries that touch a specific student's data are
  scoped to `req.session.studentId` taken from the server-side session — never
  from a client-supplied ID, header, or hidden form field. This prevents a
  logged-in user from viewing or modifying another student's profile or
  enrollments simply by changing an ID in the request (insecure direct object
  reference / IDOR).
- **Reverse guard:** `redirectIfAuthenticated` keeps already-logged-in users away
  from `/login` and `/register`, avoiding confusing duplicate-session states.
- **Invoice ownership check:** `POST /fees/pay` (`routes/fees.js`) looks up the
  submitted `invoice_id` filtered by the logged-in student's ID and rejects the
  request if no matching invoice is found, rather than trusting that the ID
  belongs to the caller. This specifically blocks a student from paying down
  (or probing the existence of) another student's invoice by guessing/iterating
  IDs.
- **Read-only grades:** `routes/grades.js` exposes only a `GET /grades` route —
  there is no write endpoint, by design. Grades are seeded/assigned outside the
  student-facing application, so there is no code path through which a student
  can set or alter their own (or anyone else's) grade. If a future iteration
  added an instructor/admin grading feature, that endpoint would need its own
  role check (this app currently has only one role: "student").

## 3. Session Management

- Sessions are managed server-side with `express-session`; the client only holds
  an opaque session ID cookie (`sid`), never user data or credentials.
- **Cookie hardening** (`server.js`):
  - `httpOnly: true` — inaccessible to client-side JavaScript, mitigating
    session-token theft via XSS.
  - `sameSite: 'lax'` — cookie is not sent on most cross-site requests, providing
    a baseline defense against CSRF in addition to the explicit token check.
  - `secure: true` in production (`NODE_ENV=production`) — cookie is only sent
    over HTTPS, preventing interception on the network.
  - `maxAge: 1 hour` — bounds the session lifetime.
  - Custom cookie name (`sid` instead of the default `connect.sid`) to avoid
    trivially fingerprinting the framework.
- **Logout** (`POST /logout`) calls `req.session.destroy()` and clears the cookie,
  fully invalidating server-side session state rather than just discarding the
  client cookie.
- **Known limitation:** the default `express-session` `MemoryStore` is used,
  which is fine for this assessment/demo scope but is explicitly not
  production-safe (it leaks memory and doesn't share state across processes). A
  production deployment should swap in a persistent store such as
  `connect-sqlite3` or Redis.

## 4. Input Validation Strategy

- All form input is validated **server-side** in `utils/validation.js`
  (`isValidEmail`, `isValidFullName`, `isValidPassword`), regardless of any
  HTML5 client-side `required`/`minlength`/`pattern` attributes — client-side
  checks are a UX convenience only and are never trusted, since they're trivial
  to bypass by crafting a raw HTTP request.
- Validation rules:
  - Email: simple shape check (`local@domain.tld`) plus a 254-character cap.
  - Full name: 2–100 characters.
  - Password: 8–128 characters, must contain at least one letter and one digit.
- Invalid input is rejected with a `400` status and the form is re-rendered with
  a descriptive (but not overly detailed) error message; submitted values are
  never trusted into a query without going through validation and parameterized
  binding first.
- Numeric identifiers from form input (e.g. `course_id`, `invoice_id`) are
  parsed with `parseInt` and checked with `Number.isInteger` before being used
  in a query.
- **Payment amounts** (`utils/money.js`) are validated with a strict regular
  expression (`^\d{1,9}(\.\d{1,2})?$`) before being converted to integer cents,
  which rejects negative numbers, scientific notation (`1e10`), multiple
  decimal points, and non-numeric input outright. The parsed amount is then
  re-checked server-side against that invoice's actual remaining balance
  (computed from the database, never from a client-supplied figure) so a
  request can't be tampered with to overpay, underpay, or pay a negative
  amount that would *increase* a balance.

## 5. Password Storage Method

- `bcrypt` with a cost factor of `12`, generated via `bcrypt.hashSync(password,
  12)`. Bcrypt embeds a unique random salt per hash automatically, so two users
  with the same password get different hashes, and the stored value
  (`password_hash` column) is sufficient on its own to verify future logins —
  no separate salt column is needed.
- Plaintext passwords are held in memory only for the duration of the request
  and are never logged or persisted.

## 6. Potential Vulnerabilities That Were Mitigated

| Vulnerability | Mitigation |
|---|---|
| SQL Injection | All database access uses `better-sqlite3` **parameterized queries** (`?` placeholders) — no string concatenation of user input into SQL anywhere in the codebase. |
| Cross-Site Scripting (XSS) | EJS's default `<%= %>` output auto-escapes HTML entities for every piece of user-controlled data rendered into a page (names, emails, course data). Raw/unescaped `<%- %>` is only used for trusted, static partial includes — never for user input. |
| Cross-Site Request Forgery (CSRF) | A per-session, cryptographically random CSRF token (`middleware/csrf.js`) is embedded as a hidden field in every state-changing form (login, register, logout, profile update, course enrollment) and verified with a constant-time comparison (`crypto.timingSafeEqual`) before the action is performed. Combined with `SameSite=Lax` cookies. |
| Session Fixation | `req.session.regenerate()` on login/registration issues a fresh session ID at the authentication boundary. |
| Brute-force / credential stuffing | Per-IP rate limiting on `/login` and `/register`. |
| Account/user enumeration | Generic login error message + constant-effort dummy-hash comparison for unknown emails. |
| Insecure Direct Object Reference (IDOR) | All profile/enrollment/fee data is scoped server-side to `req.session.studentId`; no endpoint accepts a client-supplied "which student" parameter. `/fees/pay` explicitly re-checks that the submitted `invoice_id` belongs to the caller before recording a payment. |
| Business-logic / price tampering | Payment amounts are parsed with a strict format check (no negatives, no scientific notation) and capped server-side at the invoice's true remaining balance — a forged form payload cannot create a negative payment or overpay an invoice. |
| Sensitive data exposure via cookies | `httpOnly`, `secure` (in production), and `sameSite` cookie flags; session contains only a numeric student ID, no PII. |
| Clickjacking / MIME sniffing / other header-based attacks | `helmet` middleware sets `X-Frame-Options`, `X-Content-Type-Options`, a default Content-Security-Policy, and other protective headers on every response. |
| Mass assignment | Route handlers explicitly destructure and validate only the expected fields (`full_name`, `email`, etc.) from `req.body` — arbitrary extra fields submitted by a client (e.g. a forged `id` or `password_hash`) are never passed through to a database write. |

## 6a. Simulated Payment System — Scope Decision

The Fees page lets a student record a payment against their tuition invoice,
but this is **deliberately not a real payment integration**:

- There are no credit card, bank account, or CVV fields anywhere in the app.
  The only input is a dollar amount applied against an existing invoice — more
  like a bursar's office manually logging a cash/check payment than an online
  checkout.
- No payment processor, gateway, or stored-card data exists, so the
  application carries **zero PCI DSS scope**. Bolting on a fake "enter your
  card number" form would have invited exactly the kind of risk (storing or
  transmitting cardholder data insecurely) this project should avoid, with no
  benefit to the assessment exercise.
- Money is stored as integer cents (`utils/money.js`) rather than floats, so
  balances can't drift due to floating-point rounding — a small but real
  correctness/integrity concern for any ledger-like feature.

## 7. OWASP Top 10 (2021) Considerations

- **A01 — Broken Access Control:** Mitigated via `requireAuth` middleware on all
  protected routes and strict server-side scoping of data to the session's
  student ID (see §2, §6).
- **A02 — Cryptographic Failures:** Passwords hashed with bcrypt (§5); cookies
  flagged `secure` in production so session tokens aren't sent over plaintext
  HTTP; no sensitive data is logged.
- **A03 — Injection:** Parameterized SQL queries throughout; output escaping via
  EJS auto-escaping (§6).
- **A04 — Insecure Design:** Generic auth error messages, rate limiting, and
  session regeneration were designed in from the start rather than bolted on.
- **A05 — Security Misconfiguration:** `helmet` applies sane default security
  headers; `.env` keeps secrets out of source control; `NODE_ENV` toggles
  cookie `secure` flag appropriately between dev and prod.
- **A06 — Vulnerable and Outdated Components:** Dependencies are kept minimal
  (`express`, `express-session`, `bcrypt`, `better-sqlite3`, `ejs`, `helmet`,
  `express-rate-limit`, `dotenv`) to reduce the attack surface; run `npm audit`
  periodically as part of an assessment.
- **A07 — Identification and Authentication Failures:** bcrypt hashing, rate
  limiting on auth endpoints, session regeneration on login, and reasonable
  session expiry (§1, §3).
- **A08 — Software and Data Integrity Failures:** No use of `eval`, dynamic
  `require`, or unpinned remote script sources in the views; static assets are
  served from a local `public/` directory only.
- **A09 — Security Logging and Monitoring Failures:** The Express error handler
  logs unexpected errors server-side (`console.error`) without leaking stack
  traces to the client. *Known gap:* there is no structured audit log of
  authentication events (login success/failure, enrollment changes) — a real
  assessment should flag this as an area to add for production use.
- **A10 — Server-Side Request Forgery (SSRF):** Not directly applicable — the
  app makes no outbound HTTP requests based on user input.

## 8. Known Out-of-Scope Limitations (intentional, for a weekend-scope project)

These are reasonable findings for an assessor to raise, and are called out here
rather than hidden:

- No email verification on registration.
- No account lockout or CAPTCHA after repeated failed logins (rate limiting only).
- No multi-factor authentication.
- Session store is in-memory (`MemoryStore`), not suitable for multi-process or
  production deployment.
- No HTTPS termination is configured in the app itself (expected to be handled
  by a reverse proxy/load balancer in any real deployment).
- No automated dependency vulnerability scanning configured (recommend adding
  `npm audit` / Dependabot in CI for a real project).
