document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const err = document.getElementById('err');
  err.style.display = 'none';
  const body = {
    username: form.username.value.trim(),
    password: form.password.value,
  };
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    window.location.href = '/';
  } else {
    const data = await res.json().catch(() => ({}));
    err.textContent = data.error || 'Sign in failed.';
    err.style.display = 'block';
  }
});
