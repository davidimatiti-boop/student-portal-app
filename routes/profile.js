const express = require('express');
const router = express.Router();

const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { isValidFullName, isValidEmail } = require('../utils/validation');

function getStudent(studentId) {
  return db.prepare('SELECT id, full_name, email FROM students WHERE id = ?').get(studentId);
}

router.get('/profile', requireAuth, (req, res) => {
  const student = getStudent(req.session.studentId);
  res.render('profile', { title: 'Profile', student, error: null, success: null });
});

router.post('/profile', requireAuth, verifyCsrfToken, (req, res) => {
  const { full_name, email } = req.body;
  const studentId = req.session.studentId;
  const render400 = (error) =>
    res.status(400).render('profile', { title: 'Profile', student: getStudent(studentId), error, success: null });

  if (!isValidFullName(full_name)) {
    return render400('Full name must be between 2 and 100 characters.');
  }
  if (!isValidEmail(email)) {
    return render400('Please enter a valid email address.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db
    .prepare('SELECT id FROM students WHERE email = ? AND id != ?')
    .get(normalizedEmail, studentId);
  if (existing) {
    return render400('That email is already in use by another account.');
  }

  db.prepare('UPDATE students SET full_name = ?, email = ? WHERE id = ?').run(
    full_name.trim(),
    normalizedEmail,
    studentId
  );

  res.render('profile', {
    title: 'Profile',
    student: getStudent(studentId),
    error: null,
    success: 'Profile updated successfully.',
  });
});

module.exports = router;
