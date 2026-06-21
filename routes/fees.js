const express = require('express');
const router = express.Router();

const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { verifyCsrfToken } = require('../middleware/csrf');
const { parseDollarsToCents, formatCents } = require('../utils/money');

// Computes amount paid and remaining balance per invoice without ever
// trusting a client-supplied balance figure.
function getInvoicesWithBalances(studentId) {
  return db
    .prepare(
      `SELECT
         fi.id,
         fi.term,
         fi.description,
         fi.amount_due_cents,
         COALESCE(SUM(fp.amount_cents), 0) AS amount_paid_cents,
         fi.amount_due_cents - COALESCE(SUM(fp.amount_cents), 0) AS balance_cents
       FROM fee_invoices fi
       LEFT JOIN fee_payments fp ON fp.invoice_id = fi.id
       WHERE fi.student_id = ?
       GROUP BY fi.id
       ORDER BY fi.created_at DESC`
    )
    .all(studentId);
}

router.get('/fees', requireAuth, (req, res) => {
  const invoices = getInvoicesWithBalances(req.session.studentId);
  res.render('fees', { title: 'Fees', invoices, formatCents, error: null, success: null });
});

router.post('/fees/pay', requireAuth, verifyCsrfToken, (req, res) => {
  const studentId = req.session.studentId;
  const invoiceId = parseInt(req.body.invoice_id, 10);
  const renderError = (error) => {
    const invoices = getInvoicesWithBalances(studentId);
    return res.status(400).render('fees', { title: 'Fees', invoices, formatCents, error, success: null });
  };

  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return renderError('Invalid invoice.');
  }

  // Ownership check: only allow paying an invoice that belongs to the
  // logged-in student, never one supplied for someone else (IDOR prevention).
  const invoice = getInvoicesWithBalances(studentId).find((inv) => inv.id === invoiceId);
  if (!invoice) {
    return renderError('That invoice was not found on your account.');
  }

  const amountCents = parseDollarsToCents(req.body.amount);
  if (amountCents === null || amountCents <= 0) {
    return renderError('Please enter a valid payment amount.');
  }
  if (amountCents > invoice.balance_cents) {
    return renderError('Payment amount cannot exceed the remaining balance.');
  }

  db.prepare(
    'INSERT INTO fee_payments (invoice_id, student_id, amount_cents) VALUES (?, ?, ?)'
  ).run(invoiceId, studentId, amountCents);

  const invoices = getInvoicesWithBalances(studentId);
  res.render('fees', {
    title: 'Fees',
    invoices,
    formatCents,
    error: null,
    success: 'Payment recorded successfully.',
  });
});

module.exports = router;
