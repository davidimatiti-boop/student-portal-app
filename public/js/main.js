// Small client-side UX enhancements only — all real validation happens on the server.

document.addEventListener('DOMContentLoaded', function () {
  // Mobile navigation toggle (public top nav on logged-out pages).
  var navToggle = document.getElementById('navToggle');
  var topNav = document.getElementById('topNav');
  if (navToggle && topNav) {
    navToggle.addEventListener('click', function () {
      topNav.classList.toggle('open');
    });
  }

  // Mobile sidebar toggle (authenticated app-shell pages).
  var sidebarToggle = document.getElementById('sidebarToggle');
  var sidebar = document.querySelector('.sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });
  }

  // Live "passwords match" hint on the registration form.
  var registerForm = document.getElementById('registerForm');
  if (registerForm) {
    var password = document.getElementById('password');
    var confirmPassword = document.getElementById('confirm_password');
    var mismatchHint = document.getElementById('passwordMismatchHint');

    function checkPasswordsMatch() {
      var mismatch = confirmPassword.value.length > 0 && password.value !== confirmPassword.value;
      mismatchHint.hidden = !mismatch;
    }

    password.addEventListener('input', checkPasswordsMatch);
    confirmPassword.addEventListener('input', checkPasswordsMatch);
  }
});
