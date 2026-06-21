const express = require('express');
const router = express.Router();

const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { isValidFullName, isValidEmail } = require('../utils/validation');

function getStudent(studentId) {
  return db.get('SELECT id, full_name, email FROM students WHERE id = ?', [studentId]);
}

router.get('/profile', requireAuth, async (req, res) => {
  const student = await getStudent(req.session.studentId);
  res.render('profile', { title: 'Profile', student, error: null, success: null });
});

router.post('/profile', requireAuth, verifyCsrfToken, async (req, res) => {
  const { full_name, email } = req.body;
  const studentId = req.session.studentId;
  const render400 = async (error) =>
    res
      .status(400)
      .render('profile', { title: 'Profile', student: await getStudent(studentId), error, success: null });

  if (!isValidFullName(full_name)) {
    return render400('Full name must be between 2 and 100 characters.');
  }
  if (!isValidEmail(email)) {
    return render400('Please enter a valid email address.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.get('SELECT id FROM students WHERE email = ? AND id != ?', [
    normalizedEmail,
    studentId,
  ]);
  if (existing) {
    return render400('That email is already in use by another account.');
  }

  await db.run('UPDATE students SET full_name = ?, email = ? WHERE id = ?', [
    full_name.trim(),
    normalizedEmail,
    studentId,
  ]);

  res.render('profile', {
    title: 'Profile',
    student: await getStudent(studentId),
    error: null,
    success: 'Profile updated successfully.',
  });
});

module.exports = router;
