(function () {
  let mode = 'in';
  const $ = (id) => document.getElementById(id);
  function setMode(m) {
    mode = m;
    $('t-in').classList.toggle('on', m === 'in'); $('t-up').classList.toggle('on', m === 'up');
    $('up-only').style.display = m === 'up' ? 'block' : 'none'; $('note').style.display = m === 'up' ? 'block' : 'none';
    $('go').textContent = m === 'up' ? 'Create account' : 'Sign in';
    $('pw').autocomplete = m === 'up' ? 'new-password' : 'current-password'; $('err').textContent = '';
  }
  $('t-in').onclick = () => setMode('in'); $('t-up').onclick = () => setMode('up');
  $('f').addEventListener('submit', async (e) => {
    e.preventDefault(); $('err').textContent = ''; $('go').disabled = true;
    try {
      const body = { email: $('email').value, password: $('pw').value };
      if (mode === 'up') Object.assign(body, { name: $('name').value, company_name: $('company').value, phone: $('phone').value });
      const d = await VT.api('POST', mode === 'up' ? '/auth/register' : '/auth/login', body);
      if (d.user.role !== 'CLIENT') { await VT.api('POST', '/auth/logout'); throw new Error('Administrators sign in at /admin/.'); }
      location.href = './';
    } catch (ex) { $('err').textContent = ex.message; $('go').disabled = false; }
  });
})();
