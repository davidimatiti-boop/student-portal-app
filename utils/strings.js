// Derives display initials from a full name, e.g. "Alice Johnson" -> "AJ".
function getInitials(fullName) {
  if (typeof fullName !== 'string' || fullName.trim().length === 0) return '?';
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

module.exports = { getInitials };
