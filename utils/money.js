// Money is stored as integer cents (never floats) to avoid floating-point
// rounding errors when adding up payments against an invoice balance.

// Accepts strings like "100", "100.5", "100.50". Rejects negatives,
// scientific notation, multiple decimal points, and more than 2 decimal
// places — all common ways a tampered request could smuggle in a bad amount.
const DOLLARS_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

function parseDollarsToCents(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!DOLLARS_PATTERN.test(trimmed)) return null;
  return Math.round(parseFloat(trimmed) * 100);
}

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

module.exports = { parseDollarsToCents, formatCents };
