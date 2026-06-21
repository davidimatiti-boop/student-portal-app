const express = require('express');
const router = express.Router();

const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { formatCents } = require('../utils/money');

router.get('/dashboard', requireAuth, (req, res) => {
  const student = db
    .prepare('SELECT id, full_name, email FROM students WHERE id = ?')
    .get(req.session.studentId);

  // Defensive: the student backing this session may have been deleted.
  if (!student) {
    return req.session.destroy(() => res.redirect('/login'));
  }

  const enrolledCourses = db
    .prepare(
      `SELECT c.id, c.course_name, c.course_code
       FROM courses c
       INNER JOIN enrollments e ON e.course_id = c.id
       WHERE e.student_id = ?
       ORDER BY c.course_name`
    )
    .all(student.id);

  const recentGrades = db
    .prepare(
      `SELECT c.course_code, g.grade
       FROM grades g
       INNER JOIN courses c ON c.id = g.course_id
       WHERE g.student_id = ?
       ORDER BY g.recorded_at DESC
       LIMIT 3`
    )
    .all(student.id);

  const { total_due_cents: totalDueCents, total_paid_cents: totalPaidCents } = db
    .prepare(
      `SELECT
         COALESCE(SUM(fi.amount_due_cents), 0) AS total_due_cents,
         COALESCE(SUM((SELECT SUM(fp.amount_cents) FROM fee_payments fp WHERE fp.invoice_id = fi.id)), 0)
           AS total_paid_cents
       FROM fee_invoices fi
       WHERE fi.student_id = ?`
    )
    .get(student.id);
  const balanceCents = totalDueCents - totalPaidCents;

  const firstName = student.full_name.trim().split(/\s+/)[0];
  const todayLabel = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  res.render('dashboard', {
    title: 'Dashboard',
    student,
    firstName,
    todayLabel,
    enrolledCourses,
    recentGrades,
    totalDue: formatCents(totalDueCents),
    totalPaid: formatCents(totalPaidCents),
    balance: formatCents(balanceCents),
  });
});

module.exports = router;
