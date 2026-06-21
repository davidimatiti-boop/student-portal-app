const express = require('express');
const router = express.Router();

const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');

router.get('/courses', requireAuth, async (req, res) => {
  const studentId = req.session.studentId;
  const courses = await db.all(
    `SELECT c.id, c.course_name, c.course_code,
       EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.student_id = ?) AS is_enrolled
     FROM courses c
     ORDER BY c.course_name`,
    [studentId]
  );

  res.render('courses', { title: 'Courses', courses });
});

router.post('/courses/enroll', requireAuth, verifyCsrfToken, async (req, res) => {
  const studentId = req.session.studentId;
  const courseId = parseInt(req.body.course_id, 10);

  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.redirect('/courses');
  }

  const course = await db.get('SELECT id FROM courses WHERE id = ?', [courseId]);
  if (!course) {
    return res.redirect('/courses');
  }

  const alreadyEnrolled = await db.get(
    'SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?',
    [studentId, courseId]
  );

  if (!alreadyEnrolled) {
    await db.run('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)', [
      studentId,
      courseId,
    ]);
  }

  res.redirect('/courses');
});

module.exports = router;
