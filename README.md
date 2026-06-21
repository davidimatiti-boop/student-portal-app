# Student Portal

A beginner-friendly Student Portal web application built with Node.js, Express, and
SQLite. It's intended as a realistic-but-simple target for a structured
**cybersecurity / security assessment** exercise — see [SECURITY_ANALYSIS.md](SECURITY_ANALYSIS.md)
for the security write-up.

## Tech Stack

- **Frontend:** Server-rendered HTML via EJS templates, plain CSS, vanilla JavaScript
- **Backend:** Node.js + Express
- **Database:** SQLite (via `better-sqlite3`)
- **Auth:** `express-session` (server-side sessions) + `bcrypt` password hashing

## Folder Structure

```
student-portal-app/
├── server.js               # App entry point — wires up middleware & routes
├── config/
│   └── database.js         # Shared SQLite connection
├── db/
│   ├── init.js              # Creates tables and seeds sample data
│   └── student_portal.sqlite (generated at first run, gitignored)
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
│   └── term.js                  # "Current term" constant used by seeding
├── views/                     # EJS templates
│   ├── partials/ (header, footer, sidebar)
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

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env and set a strong SESSION_SECRET, e.g.:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Initialize & seed the database (optional — also runs automatically on startup)
npm run db:init

# 4. Start the app
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
session auth, CSRF tokens, parameterized queries, output escaping, rate limiting,
security headers) so that an assessment can focus on verifying those controls hold
up under testing — e.g. attempting to bypass CSRF protection, brute-forcing login,
tampering with session cookies, probing for SQL injection / XSS, and checking for
IDOR on `/profile` and `/courses/enroll`. See `SECURITY_ANALYSIS.md` for the full
control inventory and OWASP Top 10 mapping.

For a production deployment (out of scope here) you'd additionally want: a
persistent session store (e.g. `connect-sqlite3` or Redis) instead of the default
in-memory store, HTTPS termination, email verification, and account lockout/2FA.
