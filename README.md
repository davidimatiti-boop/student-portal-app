# Student Portal

A beginner-friendly Student Portal web application built with Node.js, Express, and
a hosted SQLite-compatible database (Turso). It's intended as a realistic-but-simple
target for a structured **cybersecurity / security assessment** exercise — see
[SECURITY_ANALYSIS.md](SECURITY_ANALYSIS.md) for the security write-up.

## Tech Stack

- **Frontend:** Server-rendered HTML via EJS templates, plain CSS, vanilla JavaScript
- **Backend:** Node.js + Express
- **Database:** [Turso](https://turso.tech) (hosted, SQLite-compatible, via `@libsql/client`)
- **Auth:** Stateless signed-cookie sessions (`cookie-session`) + `bcrypt` password hashing

The app was originally built against a local SQLite file (`better-sqlite3`) and
in-memory sessions (`express-session`). It was migrated to a hosted DB and
stateless cookie sessions specifically to deploy on serverless hosts (Vercel),
which have no durable local disk and no single long-lived process to hold an
in-memory session store. See `SECURITY_ANALYSIS.md` for the trade-offs that
came with that move.

## Folder Structure

```
student-portal-app/
├── server.js               # Express app — middleware & routes (exported for serverless too)
├── api/
│   └── index.js             # Vercel serverless entry point, re-exports server.js
├── vercel.json              # Vercel routing + static-file bundling config
├── render.yaml              # Render blueprint (alternative host)
├── config/
│   └── database.js         # Turso client + async get/all/run helpers
├── db/
│   └── init.js              # Creates tables and seeds sample data (idempotent)
├── middleware/
│   ├── auth.js               # requireAuth / redirectIfAuthenticated route guards
│   └── csrf.js               # CSRF token generation & verification
├── routes/
│   ├── home.js
│   ├── auth.js                # register / login / logout
│   ├── dashboard.js
│   ├── profile.js
│   ├── courses.js
│   ├── fees.js                 # view invoices, record (simulated) payments
│   └── grades.js                # read-only grade viewing
├── utils/
│   ├── validation.js          # Server-side input validation helpers
│   ├── money.js                 # Cents-based money parsing/formatting
│   ├── strings.js                # Avatar initials helper
│   └── term.js                  # "Current term" constant used by seeding
├── views/                     # EJS templates
│   ├── partials/ (head, public-nav, sidebar, topbar, scripts, footer)
│   ├── home.ejs, login.ejs, register.ejs
│   ├── dashboard.ejs, profile.ejs, courses.ejs
│   ├── fees.ejs, grades.ejs
│   └── error.ejs
├── public/
│   ├── css/style.css
│   └── js/main.js
├── .env.example
└── SECURITY_ANALYSIS.md
```

## Database Schema

**students** — `id, full_name, email (unique), password_hash, created_at`
**courses** — `id, course_name, course_code (unique)`
**enrollments** — `id, student_id, course_id` (unique pair, FKs to students/courses)
**grades** — `id, student_id, course_id, term, grade, recorded_at` (read-only to students — see SECURITY_ANALYSIS.md)
**fee_invoices** — `id, student_id, term, description, amount_due_cents, created_at`
**fee_payments** — `id, invoice_id, student_id, amount_cents, paid_at`

> Money is stored as integer **cents**, never floats, to avoid rounding errors.
> The fees feature is a simulated billing ledger — it never collects real
> card/bank details, so there's no PCI scope to worry about.

## Installation & Running

### Prerequisites
- Node.js 18+ and npm
- A free [Turso](https://turso.tech) account and database

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Create a Turso database (skip if you already have one)
#    Sign up / log in at https://app.turso.tech, create a database, and
#    generate an auth token from its dashboard page.

# 3. Configure environment variables
cp .env.example .env
# Edit .env:
#   - Set a strong SESSION_SECRET, e.g.:
#       node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   - Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from the Turso dashboard

# 4. Initialize & seed the database (optional — also runs automatically on startup)
npm run db:init

# 5. Start the app
npm start
# or, for auto-restart during development:
npm run dev
```

The app runs at **http://localhost:3000** by default (configurable via `PORT` in `.env`).

## Sample Test Accounts

Seeded automatically the first time the database is created:

| Email               | Password      |
|---------------------|---------------|
| alice@example.com   | Password123!  |
| bob@example.com     | Password123!  |

You can also register a new account from `/register` — new accounts automatically
get a $750.00 tuition invoice on the Fees page, ready to test payments against.

The seeded accounts come pre-loaded with sample data so Grades/Fees aren't empty:
- **alice@example.com** is enrolled in CS101 (grade A) and SEC301 (grade B+), and
  has paid $250.00 of her $750.00 tuition invoice (balance: $500.00).
- **bob@example.com** is enrolled in MATH101 (grade B), and has made no payments
  yet (balance: $750.00).

## Pages

| Route               | Auth required | Description                                  |
|---------------------|---------------|-----------------------------------------------|
| `/`                 | No            | Home page with welcome message & nav          |
| `/register`         | No            | Create a new student account                  |
| `/login`            | No            | Log in                                        |
| `/dashboard`        | Yes           | Student name, email, enrolled courses         |
| `/profile`          | Yes           | View & update profile (name, email)           |
| `/courses`          | Yes           | List all courses, enroll in courses           |
| `/grades`           | Yes           | View grades for enrolled courses (read-only)  |
| `/fees`             | Yes           | View fee invoices & balances, record payments |
| `/logout` (POST)    | Yes           | Destroys session, redirects to `/login`       |

## Notes for a Security Assessment

This app intentionally implements a solid security **baseline** (hashed passwords,
signed-cookie session auth, CSRF tokens, parameterized queries, output escaping,
rate limiting, security headers) so that an assessment can focus on verifying
those controls hold up under testing — e.g. attempting to bypass CSRF protection,
brute-forcing login, tampering with session cookies, probing for SQL injection /
XSS, and checking for IDOR on `/profile`, `/courses/enroll`, and `/fees/pay`. See
`SECURITY_ANALYSIS.md` for the full control inventory and OWASP Top 10 mapping.

## Deploying to Vercel

```bash
npm install -g vercel   # or use `npx vercel`
vercel login
vercel                  # first deploy, follow the prompts
vercel env add SESSION_SECRET production
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
vercel env add NODE_ENV production   # value: production
vercel --prod
```

Or via the [Vercel dashboard](https://vercel.com/dashboard): **Add New → Project**,
import the GitHub repo, then add the same four environment variables under
**Settings → Environment Variables** before deploying.

`vercel.json` routes every request to `api/index.js` (a thin wrapper around
`server.js`) and tells Vercel to bundle `public/` and `views/` into the
serverless function — both are read from disk at runtime (static assets, EJS
templates) rather than `require()`-d, so they wouldn't be included otherwise.

## Deploying to Render (alternative)

A `render.yaml` blueprint is included as an alternative to Vercel — since the
database now lives in Turso rather than on local disk, this works fine on
Render's **free** plan (no paid Disk needed, unlike the original local-SQLite
setup).

1. Push this repo to GitHub.
2. In the [Render dashboard](https://dashboard.render.com), choose
   **New → Blueprint** and connect the repo. Render reads `render.yaml`.
3. Render will prompt you to manually fill in `TURSO_DATABASE_URL` and
   `TURSO_AUTH_TOKEN` (marked `sync: false` in the blueprint, since they're
   sensitive and external) — `SESSION_SECRET` is auto-generated.
4. Deploy — you'll get a `https://<service-name>.onrender.com` URL with HTTPS.
