const express = require('express');
const router = express.Router();

const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');

router.get('/courses', requireAuth, (req, res) => {
  const studentId = req.session.studentId;
  const courses = db
    .prepare(
      `SELECT c.id, c.course_name, c.course_code,
         EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.student_id = ?) AS is_enrolled
       FROM courses c
       ORDER BY c.course_name`
    )
    .all(studentId);

  res.render('courses', { title: 'Courses', courses });
});

router.post('/courses/enroll', requireAuth, verifyCsrfToken, (req, res) => {
  const studentId = req.session.studentId;
  const courseId = parseInt(req.body.course_id, 10);

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.redirect('/courses');
  }

  const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId);
  if (!course) {
    return res.redirect('/courses');
  }

  const alreadyEnrolled = db
    .prepare('SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?')
    .get(studentId, courseId);

  if (!alreadyEnrolled) {
    db.prepare('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)').run(studentId, courseId);
  }

  res.redirect('/courses');
});

module.exports = router;
