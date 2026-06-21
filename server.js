require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const helmet = require('helmet');

const initializeDatabase = require('./db/init');
const db = require('./config/database');
const { attachCsrfToken } = require('./middleware/csrf');
const { getInitials } = require('./utils/strings');

const homeRoutes = require('./routes/home');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const profileRoutes = require('./routes/profile');
const courseRoutes = require('./routes/courses');
const feeRoutes = require('./routes/fees');
const gradeRoutes = require('./routes/grades');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = Boolean(process.env.VERCEL);

if (isProduction) {
  // Needed so secure cookies / req.secure work correctly behind a reverse proxy.
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Create tables and seed sample data on startup (safe to run repeatedly).
// Gate every request behind this promise so a request arriving during a
// cold start (common on serverless hosts) waits for it instead of hitting
// missing tables; after the first resolution it's an already-settled promise,
// so this await is effectively free on every subsequent request.
const dbReady = initializeDatabase();
app.use((req, res, next) => {
  dbReady.then(() => next()).catch(next);
});

// Sets a range of protective HTTP response headers (CSP, X-Frame-Options, etc).
app.use(helmet());

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Stateless, signed-cookie sessions (no server-side store needed) — required
// on serverless hosts like Vercel, where there's no single long-lived process
// to hold an in-memory session store. The whole session is small (just a
// student ID + CSRF token) and signed with SESSION_SECRET, so it can't be
// tampered with, though — unlike the previous opaque server-side session ID —
// its contents are base64-visible to the client. See SECURITY_ANALYSIS.md.
app.use(
  cookieSession({
    name: 'sid', // avoid the default "connect.sid" fingerprint
    keys: [process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me'],
    httpOnly: true, // not readable from client-side JavaScript
    secure: isProduction, // requires HTTPS in production
    sameSite: 'lax', // mitigates CSRF on cross-site navigations
    maxAge: 1000 * 60 * 60, // 1 hour
  })
);

app.use(attachCsrfToken);

// Make auth state and a lightweight student identity available to every
// view without each route having to pass it explicitly (used by the sidebar
// layout's top bar avatar/name).
app.use(async (req, res, next) => {
  const studentId = req.session && req.session.studentId;
  res.locals.isAuthenticated = Boolean(studentId);

  if (studentId) {
    const student = await db.get('SELECT full_name FROM students WHERE id = ?', [studentId]);
    res.locals.currentStudentName = student ? student.full_name : '';
    res.locals.currentStudentInitials = student ? getInitials(student.full_name) : '?';
  }
  next();
});

app.use('/', homeRoutes);
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', profileRoutes);
app.use('/', courseRoutes);
app.use('/', feeRoutes);
app.use('/', gradeRoutes);

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not Found', message: 'Page not found.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Error', message: 'An unexpected error occurred.' });
});

if (!isVercel) {
  dbReady
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Student Portal running at http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Database initialization failed:', err);
      process.exit(1);
    });
}

module.exports = app;
