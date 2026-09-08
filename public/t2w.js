const T2W = (() => {
  const PAGES = [
    ['/', 'Menu'],
    ['/search.html', 'Search'],
    ['/dashboard.html', 'Costs'],
    ['/end-of-day.html', 'End of day'],
    ['/schedule.html', 'Live schedule'],
    ['/chainage.html', 'Chainage map'],
    ['/reports.html', 'Reports'],
    ['/drawings.html', 'Drawings'],
    ['/quality.html', 'Data quality'],
    ['/rates.html', 'Plant & rates'],
    ['/edit-log.html', 'Edit log'],
  ];

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) { window.location.href = '/login.html'; throw new Error('logged out'); }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText);
    }
    return res.status === 204 ? null : res.json();
  }

  function money(v) {
    if (v === null || v === undefined || v === '') return '';
    return '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  function num(v, dp = 0) {
    if (v === null || v === undefined || v === '') return '';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: dp });
  }
  function pct(v) {
    if (v === null || v === undefined) return '';
    return (v * 100).toFixed(0) + '%';
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function pill(v) {
    if (v === 'YES' || v === 'Yes') return `<span class="pill yes">${esc(v)}</span>`;
    if (v === 'NO' || v === 'No') return `<span class="pill no">${esc(v)}</span>`;
    return esc(v ?? '');
  }
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  async function loadEnhancement(here) {
    const scripts = {
      '/end-of-day.html': '/schedule-integration.js',
      '/schedule.html': '/schedule-method.js',
    };
    const src = scripts[here];
    if (!src || document.querySelector(`script[data-t2w-enhancement="${src}"]`)) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.dataset.t2wEnhancement = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function mount() {
    const me = await api('/me').catch(() => null);
    const bar = document.createElement('div');
    bar.className = 'topbar';
    const here = window.location.pathname === '/index.html' ? '/' : window.location.pathname;
    const pages = me && me.role === 'admin' ? PAGES.concat([['/admin.html', 'Admin']]) : PAGES;
    bar.innerHTML = `
      <h1>T2W Pipeline — Master Asset Register</h1>
      <nav>${pages.map(([href, label]) =>
        `<a href="${href}" class="${here === href ? 'active' : ''}">${label}</a>`).join('')}</nav>
      <div class="who">
        ${me ? esc(me.fullName || me.username) : ''}
        <button class="logout" id="logoutBtn">Sign out</button>
      </div>`;
    document.body.prepend(bar);
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await api('/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
    try { await loadEnhancement(here); } catch (err) { console.error(err); }
    return me;
  }

  return { api, money, num, pct, esc, pill, todayISO, mount };
})();
