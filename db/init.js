// Database initialization & seed script.
// Run directly with `npm run db:init`, or it runs automatically on server startup
// (table creation and seeding are idempotent, so running it twice is safe).
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { CURRENT_TERM } = require('../utils/term');

const SALT_ROUNDS = 12;

// Default tuition charge auto-invoiced to every new student. Kept as a
// constant (rather than configurable input) since this is a simulated fee
// system, not a real billing integration.
const DEFAULT_TUITION_CENTS = 75000; // $750.00

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_name TEXT NOT NULL,
      course_code TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, course_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      grade TEXT NOT NULL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, course_id, term),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    -- A fee invoice is a charge owed by a student (e.g. tuition for a term).
    CREATE TABLE IF NOT EXISTS fee_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_due_cents INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    -- A fee payment is a record of money applied against one invoice.
    -- This app only *records* payments (like a bursar's office ledger) —
    -- it never collects or stores real card/bank details. See SECURITY_ANALYSIS.md.
    CREATE TABLE IF NOT EXISTS fee_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES fee_invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );
  `);
}

// Creates the standard tuition invoice for a single student. Called both
// during seeding and whenever a new student registers (routes/auth.js).
function createDefaultInvoice(studentId) {
  db.prepare(
    `INSERT INTO fee_invoices (student_id, term, description, amount_due_cents)
     VALUES (?, ?, ?, ?)`
  ).run(studentId, CURRENT_TERM, 'Tuition Fee', DEFAULT_TUITION_CENTS);
}

function seedCourses() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM courses').get();
  if (count > 0) return;

  const insert = db.prepare('INSERT INTO courses (course_name, course_code) VALUES (?, ?)');
  const courses = [
    ['Introduction to Computer Science', 'CS101'],
    ['Web Application Security', 'SEC301'],
    ['Database Systems', 'CS210'],
    ['Calculus I', 'MATH101'],
    ['Networking Fundamentals', 'NET150'],
  ];

  const insertAll = db.transaction((rows) => {
    rows.forEach((row) => insert.run(...row));
  });
  insertAll(courses);
}

function seedTestStudents() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM students').get();
  if (count > 0) return;

  const insertStudent = db.prepare(
    'INSERT INTO students (full_name, email, password_hash) VALUES (?, ?, ?)'
  );
  const getCourseId = db.prepare('SELECT id FROM courses WHERE course_code = ?');
  const insertEnrollment = db.prepare(
    'INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)'
  );
  const insertGrade = db.prepare(
    'INSERT INTO grades (student_id, course_id, term, grade) VALUES (?, ?, ?, ?)'
  );
  const insertPayment = db.prepare(
    'INSERT INTO fee_payments (invoice_id, student_id, amount_cents) VALUES (?, ?, ?)'
  );

  // Sample/test accounts for the security assessment. See README.md.
  // Each gets a couple of enrollments + grades, and a tuition invoice (one
  // partially paid, one untouched) so the Fees and Grades pages have
  // something to show out of the box.
  const testAccounts = [
    {
      fullName: 'Alice Johnson',
      email: 'alice@example.com',
      password: 'Password123!',
      enrollments: [
        { courseCode: 'CS101', grade: 'A' },
        { courseCode: 'SEC301', grade: 'B+' },
      ],
      paymentCents: 25000, // partial payment toward the $750 invoice
    },
    {
      fullName: 'Bob Smith',
      email: 'bob@example.com',
      password: 'Password123!',
      enrollments: [{ courseCode: 'MATH101', grade: 'B' }],
      paymentCents: 0,
    },
  ];

  testAccounts.forEach(({ fullName, email, password, enrollments, paymentCents }) => {
    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    const { lastInsertRowid: studentId } = insertStudent.run(fullName, email, passwordHash);

    enrollments.forEach(({ courseCode, grade }) => {
      const course = getCourseId.get(courseCode);
      insertEnrollment.run(studentId, course.id);
      insertGrade.run(studentId, course.id, CURRENT_TERM, grade);
    });

    createDefaultInvoice(studentId);
    if (paymentCents > 0) {
      const invoice = db
        .prepare('SELECT id FROM fee_invoices WHERE student_id = ?')
        .get(studentId);
      insertPayment.run(invoice.id, studentId, paymentCents);
    }
  });
}

function initializeDatabase() {
  createTables();
  seedCourses();
  seedTestStudents();
}

// Allow running this file directly: `node db/init.js`
if (require.main === module) {
  initializeDatabase();
  console.log('Database initialized and seeded successfully.');
  process.exit(0);
}

module.exports = initializeDatabase;
module.exports.createDefaultInvoice = createDefaultInvoice;
