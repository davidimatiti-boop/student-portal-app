const express = require('express');
const router = express.Router();

const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Read-only by design: students can view grades but there is no write
// endpoint, so there is no path for a student to alter their own grade.
// See SECURITY_ANALYSIS.md (Authorization Controls).
router.get('/grades', requireAuth, (req, res) => {
  const grades = db
    .prepare(
      `SELECT c.course_code, c.course_name, g.grade, g.term
       FROM enrollments e
       INNER JOIN courses c ON c.id = e.course_id
       LEFT JOIN grades g ON g.course_id = e.course_id AND g.student_id = e.student_id
       WHERE e.student_id = ?
       ORDER BY c.course_name`
    )
    .all(req.session.studentId);

  res.render('grades', { title: 'Grades', grades });
});

module.exports = router;
