// Minimal CSRF protection using the "synchronizer token" pattern:
// a random token is stored server-side in the session and must be echoed
// back in a hidden form field on every state-changing POST request.
const crypto = require('crypto');

function attachCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyCsrfToken(req, res, next) {
  const tokenFromForm = req.body && req.body._csrf;
  const tokenFromSession = req.session && req.session.csrfToken;

  const valid =
    typeof tokenFromForm === 'string' &&
    typeof tokenFromSession === 'string' &&
    tokenFromForm.length === tokenFromSession.length &&
    crypto.timingSafeEqual(Buffer.from(tokenFromForm), Buffer.from(tokenFromSession));

  if (!valid) {
    return res.status(403).render('error', {
      message: 'Your form session expired or is invalid. Please go back and try again.',
    });
  }
  next();
}

module.exports = { attachCsrfToken, verifyCsrfToken };
