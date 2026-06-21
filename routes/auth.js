const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const db = require('../config/database');
const { createDefaultInvoice } = require('../db/init');
const { redirectIfAuthenticated } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { isValidEmail, isValidFullName, isValidPassword } = require('../utils/validation');

const SALT_ROUNDS = 12;

// A precomputed valid bcrypt hash with no matching password, used to keep
// login timing consistent when the submitted email doesn't exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-only', SALT_ROUNDS);

// Throttle login/register attempts per IP to slow down brute-force/credential-stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attempts from this device. Please try again in 15 minutes.',
});

// --- Registration ---------------------------------------------------------

router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('register', { title: 'Register', error: null, formData: { full_name: '', email: '' } });
});

router.post('/register', redirectIfAuthenticated, authLimiter, verifyCsrfToken, (req, res) => {
  const { full_name, email, password, confirm_password } = req.body;
  const formData = { full_name: full_name || '', email: email || '' };
  const render400 = (error) =>
    res.status(400).render('register', { title: 'Register', error, formData });

  if (!isValidFullName(full_name)) {
    return render400('Full name must be between 2 and 100 characters.');
  }
  if (!isValidEmail(email)) {
    return render400('Please enter a valid email address.');
  }
  if (!isValidPassword(password)) {
    return render400('Password must be at least 8 characters and include a letter and a number.');
  }
  if (password !== confirm_password) {
    return render400('Passwords do not match.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM students WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return render400('An account with this email already exists.');
  }

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const insert = db.prepare(
    'INSERT INTO students (full_name, email, password_hash) VALUES (?, ?, ?)'
  );
  const result = insert.run(full_name.trim(), normalizedEmail, passwordHash);
  createDefaultInvoice(result.lastInsertRowid);

  // Regenerate the session on privilege change (anonymous -> authenticated)
  // to prevent session fixation attacks.
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('error', { title: 'Error', message: 'Something went wrong. Please try logging in.' });
    }
    req.session.studentId = result.lastInsertRowid;
    res.redirect('/dashboard');
  });
});

// --- Login -----------------------------------------------------------------

router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', { title: 'Login', error: null, formData: { email: '' } });
});

router.post('/login', redirectIfAuthenticated, authLimiter, verifyCsrfToken, (req, res) => {
  const { email, password } = req.body;
  const formData = { email: email || '' };
  // Deliberately generic message: don't reveal whether the email exists.
  const genericError = 'Invalid email or password.';

  if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0) {
    return res.status(400).render('login', { title: 'Login', error: genericError, formData });
  }

  const student = db
    .prepare('SELECT id, full_name, email, password_hash FROM students WHERE email = ?')
    .get(email.trim().toLowerCase());

  // Always compare against a hash (real or dummy) so login takes a
  // consistent amount of time whether or not the account exists.
  const hashToCompare = student ? student.password_hash : DUMMY_HASH;
  const passwordMatches = bcrypt.compareSync(password, hashToCompare);

  if (!student || !passwordMatches) {
    return res.status(400).render('login', { title: 'Login', error: genericError, formData });
  }

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('error', { title: 'Error', message: 'Something went wrong. Please try again.' });
    }
    req.session.studentId = student.id;
    res.redirect('/dashboard');
  });
});

// --- Logout ------------------------------------------------------------------

router.post('/logout', verifyCsrfToken, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.redirect('/login');
  });
});

module.exports = router;
