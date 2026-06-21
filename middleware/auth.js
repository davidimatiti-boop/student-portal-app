// Route-protection middleware: gates access to pages that require a logged-in student.

function requireAuth(req, res, next) {
  if (!req.session || !req.session.studentId) {
    return res.redirect('/login');
  }
  next();
}

// Keeps already-logged-in users away from the login/register forms.
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.studentId) {
    return res.redirect('/dashboard');
  }
  next();
}

module.exports = { requireAuth, redirectIfAuthenticated };
