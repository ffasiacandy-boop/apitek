(function () {
  const { el, api, toast, modal, confirm, field, badge, fmtDate, table, empty, spinner, yesNo } = VT;
  const PLANS = ['STARTER', 'BUSINESS', 'ENTERPRISE'];
  const NAV = [['dashboard', '\u25A6', 'Dashboard'], ['clients', '\uD83D\uDC65', 'Clients'], ['licenses', '\uD83D\uDD11', 'Licenses'], ['domains', '\uD83C\uDF10', 'Domains'], ['products', '\uD83D\uDC55', 'Products'], ['settings', '\u2699', 'Settings']];
  let me = null;

  const content = el('main', { class: 'main' });
  const side = el('aside', { class: 'side' });

  function shell() {
    const app = document.getElementById('app');
    app.replaceChildren(el('div', { class: 'shell' }, side, content));
    renderSide();
  }
  function renderSide() {
    const cur = (location.hash.replace(/^#\//, '').split('/')[0]) || 'dashboard';
    side.replaceChildren(
      el('div', { class: 'brand' }, el('div', { class: 'logo' }, '\uD83D\uDC55'), 'Try-On Admin'),
      ...NAV.map(([id, ic, label]) => el('a', { class: 'nav' + (cur === id ? ' on' : ''), href: '#/' + id, onclick: () => side.classList.remove('open') }, el('span', null, ic), label)),
      el('div', { class: 'grow' }),
      el('div', { class: 'small', style: { padding: '0 12px', color: '#8e93b8' } }, me.email),
      el('button', { class: 'nav', onclick: VT.logout }, el('span', null, '\u21AA'), 'Logout'));
  }
  const topbar = (title) => el('div', { class: 'topbar' }, el('button', { class: 'burger', 'aria-label': 'Menu', onclick: () => side.classList.toggle('open') }, '\u2630'), el('strong', null, title));
  const head = (title, ...actions) => [topbar(title), el('div', { class: 'page-head' }, el('h1', null, title), el('div', { class: 'actions' }, actions))];

  // ---- license actions (shared by Clients, Licenses and Client detail) ----
  async function extendDialog(l) {
    const run = (days) => async () => { await api('POST', `/admin/licenses/${l.id}/extend`, { days }); toast(`Extended by ${days} days`, 'ok'); };
    const body = el('div', null, el('p', { class: 'muted' }, `Current expiry: ${fmtDate(l.expiry_date)}`),
      el('div', { class: 'actions' }, [[30, '+30 DAYS'], [90, '+90 DAYS'], [365, '+1 YEAR']].map(([d, t]) => el('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await run(d)(); e.target.closest('.overlay').remove(); route(); } catch (x) { toast(x.message, 'err'); e.target.disabled = false; } } }, t))));
    await modal('Extend license', body, [{ label: 'Close', value: false }], l.license_key);
  }
  async function licenseAction(l, action) {
    if (action === 'disable' && !(await confirm('Disable Try-On?', `Virtual Try-On will stop working for ${l.company_name || 'this client'} on all websites.`, { confirmText: 'Disable', danger: true }))) return;
    if (action === 'suspend' && !(await confirm('Suspend Try-On?', 'Try-On stops working until the license is reactivated.', { confirmText: 'Suspend', danger: true }))) return;
    try { await api('POST', `/admin/licenses/${l.id}/${action}`); toast(`License ${action}d`, 'ok'); route(); } catch (e) { toast(e.message, 'err'); }
  }
  function statusButtons(l, withExtend = true) {
    const s = l.effective_status, out = [];
    if (s === 'ACTIVE' || s === 'EXPIRED') out.push(el('button', { class: 'btn danger sm', onclick: () => licenseAction(l, 'disable') }, 'Disable'));
    if (s === 'DISABLED') out.push(el('button', { class: 'btn good sm', onclick: () => licenseAction(l, 'enable') }, 'Enable'));
    if (s === 'SUSPENDED') out.push(el('button', { class: 'btn good sm', onclick: () => licenseAction(l, 'reactivate') }, 'Reactivate'));
    if (withExtend) out.push(el('button', { class: 'btn sm', onclick: () => extendDialog(l) }, 'Extend'));
    return out;
  }

  // ---- dashboard ----
  async function dashboard() {
    content.replaceChildren(...head('Dashboard'), spinner());
    const s = await api('GET', '/admin/stats');
    const card = (label, n) => el('div', { class: 'card stat' }, el('div', { class: 'muted small' }, label), el('div', { class: 'n' }, n));
    content.replaceChildren(...head('Dashboard'),
      el('div', { class: 'grid stats' }, card('Total Clients', s.clients), card('Active Licenses', s.active), card('Disabled Licenses', s.disabled + s.suspended), card('Expired Licenses', s.expired), card('Total Products', s.products)),
      el('div', { class: 'card' }, el('h2', { style: { marginBottom: '10px' } }, 'Expiring within 30 days'),
        s.expiringSoon.length ? table(['Client', 'License', 'Plan', 'Expiry', ''], s.expiringSoon.map((l) => [l.company_name, el('span', { class: 'mono' }, l.license_key), l.plan, fmtDate(l.expiry_date), el('button', { class: 'btn sm', onclick: () => extendDialog(l) }, 'Extend')])) : empty('\u2705', 'No licenses expiring soon.')));
  }

  // ---- clients ----
  async function newClientDialog() {
    const i = {
      name: el('input', { required: true, maxlength: 100 }), email: el('input', { type: 'email', required: true }), company: el('input', { required: true, maxlength: 150 }),
      phone: el('input', { maxlength: 30 }), password: el('input', { type: 'text', minlength: 8, placeholder: 'Min 8 characters' }),
      plan: el('select', { value: 'BUSINESS' }, PLANS.map((p) => el('option', { value: p }, p))), expiry: el('input', { type: 'date', value: VT.todayPlus(30) }), domain: el('input', { placeholder: 'abcfashion.com' }),
    };
    const body = el('div', null, field('Contact name', i.name), field('Email (login)', i.email), field('Company', i.company), field('Phone (optional)', i.phone), field('Temporary password', i.password),
      el('div', { class: 'row2' }, field('Plan', i.plan), field('Expiry', i.expiry)), field('Allowed domain (optional)', i.domain));
    const done = await modal('New client', body, [{ label: 'Cancel', value: false }, { label: 'Create client + license', kind: 'primary', action: async () => {
      const c = await api('POST', '/admin/clients', { name: i.name.value, email: i.email.value, password: i.password.value, company_name: i.company.value, phone: i.phone.value });
      await api('POST', '/admin/licenses', { client_id: c.client_id, plan: i.plan.value, expiry_date: i.expiry.value });
      if (i.domain.value.trim()) await api('POST', `/admin/clients/${c.client_id}/domains`, { domain: i.domain.value });
      toast('Client created', 'ok');
    } }]);
    if (done) route();
  }
  async function clients() {
    content.replaceChildren(...head('Clients'), spinner());
    const { clients: list } = await api('GET', '/admin/clients');
    const rows = list.map((c) => {
      const l = c.license;
      return [
        el('div', null, el('strong', null, c.company_name), el('div', { class: 'muted small' }, c.email)),
        c.domains.length ? c.domains.map((d) => el('div', { class: 'small' }, d.domain)) : '-',
        l ? l.plan : '-', l ? el('span', { class: 'mono small' }, l.license_key) : '-',
        l ? badge(l.effective_status) : el('span', { class: 'muted' }, 'No license'), l ? fmtDate(l.expiry_date) : '-',
        el('div', { class: 'actions' }, el('a', { class: 'btn sm', href: '#/clients/' + c.id }, 'View'), l ? statusButtons({ ...l, company_name: c.company_name }) : null),
      ];
    });
    content.replaceChildren(...head('Clients', el('button', { class: 'btn primary', onclick: newClientDialog }, '+ New client')),
      el('div', { class: 'card' }, rows.length ? table(['Client', 'Domain', 'Plan', 'License', 'Status', 'Expiry', 'Actions'], rows) : empty('\uD83D\uDC65', 'No clients yet. Create your first client.')));
  }

  async function createLicenseDialog(clientId) {
    const plan = el('select', null, PLANS.map((p) => el('option', { value: p }, p))), exp = el('input', { type: 'date', value: VT.todayPlus(30) });
    const ok = await modal('Create license', el('div', null, field('Plan', plan), field('Expiry date', exp)), [{ label: 'Cancel', value: false }, { label: 'Create', kind: 'primary', action: async () => { await api('POST', '/admin/licenses', { client_id: clientId, plan: plan.value, expiry_date: exp.value }); toast('License created', 'ok'); } }]);
    if (ok) route();
  }
  async function addDomainDialog(clientId) {
    const d = el('input', { placeholder: 'shop.example.com' });
    const ok = await modal('Add allowed domain', field('Domain', d), [{ label: 'Cancel', value: false }, { label: 'Add', kind: 'primary', action: async () => { await api('POST', `/admin/clients/${clientId}/domains`, { domain: d.value }); toast('Domain added', 'ok'); } }]);
    if (ok) route();
  }
  async function domainRow(d, withClient) {
    return [withClient ? d.company_name : null, d.domain, yesNo(d.verified, 'Verified', 'Pending'),
      el('div', { class: 'actions' },
        el('button', { class: 'btn sm', onclick: async () => { try { await api('PATCH', '/admin/domains/' + d.id, { verified: !d.verified }); route(); } catch (e) { toast(e.message, 'err'); } } }, d.verified ? 'Unverify' : 'Verify'),
        el('button', { class: 'btn sm danger', onclick: async () => { if (await confirm('Remove domain?', d.domain, { confirmText: 'Remove', danger: true })) { try { await api('DELETE', '/admin/domains/' + d.id); route(); } catch (e) { toast(e.message, 'err'); } } } }, 'Remove'))].filter((x) => x !== null);
  }
  const productRows = (list, withClient) => list.map((p) => [withClient ? p.company_name : null, el('span', { class: 'mono small' }, p.product_id), p.name, p.category, el('a', { href: p.garment_image, target: '_blank', rel: 'noopener noreferrer' }, 'Image')].filter((x) => x !== null));

  async function clientDetail(id) {
    content.replaceChildren(...head('Client'), spinner());
    const d = await api('GET', '/admin/clients/' + id);
    const c = d.client, l = d.licenses[0] ? { ...d.licenses[0], company_name: c.company_name } : null;
    const info = el('div', { class: 'card' }, el('h2', { style: { marginBottom: '12px' } }, c.company_name),
      el('dl', { class: 'kv', style: { margin: 0 } }, el('dt', null, 'Contact'), el('dd', null, c.name), el('dt', null, 'Email'), el('dd', null, c.email), el('dt', null, 'Company'), el('dd', null, c.company_name), el('dt', null, 'Phone'), el('dd', null, c.phone || '-')));
    let licCard;
    if (!l) licCard = el('div', { class: 'card' }, el('h2', null, 'License'), empty('\uD83D\uDD11', 'No license yet.'), el('div', { class: 'actions', style: { justifyContent: 'center' } }, el('button', { class: 'btn primary', onclick: () => createLicenseDialog(c.id) }, 'Create license')));
    else {
      const s = l.effective_status;
      const plan = el('select', { value: l.plan }, PLANS.map((p) => el('option', { value: p }, p)));
      const start = el('input', { type: 'date', value: l.start_date }), exp = el('input', { type: 'date', value: l.expiry_date });
      const big = (label, kind, a) => el('button', { class: 'btn ' + kind, onclick: () => licenseAction(l, a) }, label);
      const ext = (label, days) => el('button', { class: 'btn', onclick: async () => { try { await api('POST', `/admin/licenses/${l.id}/extend`, { days }); toast('Extended', 'ok'); route(); } catch (e) { toast(e.message, 'err'); } } }, label);
      licCard = el('div', { class: 'card' }, el('h2', { style: { marginBottom: '12px' } }, 'License'),
        el('div', { class: 'bigstatus' }, badge(s), el('span', { class: 'mono' }, l.license_key), el('span', { class: 'muted' }, `Expires ${fmtDate(l.expiry_date)}`)),
        el('div', { class: 'actions' },
          (s === 'DISABLED') ? big('ENABLE TRY-ON', 'good', 'enable') : null,
          (s === 'ACTIVE' || s === 'EXPIRED' || s === 'SUSPENDED') ? big('DISABLE TRY-ON', 'danger', 'disable') : null,
          (s === 'ACTIVE' || s === 'EXPIRED') ? big('SUSPEND', '', 'suspend') : null,
          (s === 'SUSPENDED') ? big('REACTIVATE', 'good', 'reactivate') : null,
          ext('+30 DAYS', 30), ext('+90 DAYS', 90), ext('+1 YEAR', 365)),
        el('div', { class: 'row2', style: { marginTop: '8px' } }, field('Plan', plan), field('Start date', start)), field('Expiry date', exp),
        el('button', { class: 'btn primary', style: { marginTop: '12px' }, onclick: async () => { try { await api('PATCH', '/admin/licenses/' + l.id, { plan: plan.value, start_date: start.value, expiry_date: exp.value }); toast('License updated', 'ok'); route(); } catch (e) { toast(e.message, 'err'); } } }, 'Save changes'));
    }
    const doms = await Promise.all(d.domains.map((x) => domainRow(x, false)));
    content.replaceChildren(...head(c.company_name, el('a', { class: 'btn', href: '#/clients' }, '\u2190 Back')), el('div', { class: 'grid two' }, info, licCard),
      el('div', { class: 'card' }, el('div', { class: 'page-head', style: { marginBottom: '8px' } }, el('h2', null, 'Allowed domains'), el('button', { class: 'btn sm primary', onclick: () => addDomainDialog(c.id) }, '+ Add domain')),
        doms.length ? table(['Domain', 'Status', 'Actions'], doms) : empty('\uD83C\uDF10', 'No domains. Try-On will not work until a verified domain is added.')),
      el('div', { class: 'card' }, el('h2', { style: { marginBottom: '8px' } }, 'Products'), d.products.length ? table(['ID', 'Name', 'Category', 'Image'], productRows(d.products, false)) : empty('\uD83D\uDC55', 'No products yet.')));
  }

  // ---- licenses / domains / products ----
  async function licenses() {
    content.replaceChildren(...head('Licenses'), spinner());
    const { licenses: list } = await api('GET', '/admin/licenses');
    content.replaceChildren(...head('Licenses'), el('div', { class: 'card' }, list.length ? table(['Client', 'License', 'Plan', 'Status', 'Start', 'Expiry', 'Domains', 'Actions'],
      list.map((l) => [l.company_name, el('span', { class: 'mono small' }, l.license_key), l.plan, badge(l.effective_status), fmtDate(l.start_date), fmtDate(l.expiry_date), l.domains.map((d) => d.domain).join(', ') || '-', el('div', { class: 'actions' }, el('a', { class: 'btn sm', href: '#/clients/' + l.client_id }, 'View'), statusButtons(l))])) : empty('\uD83D\uDD11', 'No licenses yet.')));
  }
  async function domains() {
    content.replaceChildren(...head('Domains'), spinner());
    const [{ domains: list }, { clients: cl }] = await Promise.all([api('GET', '/admin/domains'), api('GET', '/admin/clients')]);
    const add = async () => {
      const sel = el('select', null, cl.map((c) => el('option', { value: c.id }, c.company_name))), dom = el('input', { placeholder: 'shop.example.com' });
      const ok = await modal('Add allowed domain', el('div', null, field('Client', sel), field('Domain', dom)), [{ label: 'Cancel', value: false }, { label: 'Add', kind: 'primary', action: async () => { await api('POST', `/admin/clients/${sel.value}/domains`, { domain: dom.value }); toast('Domain added', 'ok'); } }]);
      if (ok) route();
    };
    const rows = await Promise.all(list.map((d) => domainRow(d, true)));
    content.replaceChildren(...head('Domains', cl.length ? el('button', { class: 'btn primary', onclick: add }, '+ Add domain') : null),
      el('div', { class: 'card' }, el('p', { class: 'muted small', style: { marginTop: 0 } }, 'Only verified domains can run Try-On. Domains requested by clients stay pending until you verify them.'), rows.length ? table(['Client', 'Domain', 'Status', 'Actions'], rows) : empty('\uD83C\uDF10', 'No domains yet.')));
  }
  async function products() {
    content.replaceChildren(...head('Products'), spinner());
    const { products: list } = await api('GET', '/admin/products');
    content.replaceChildren(...head('Products'), el('div', { class: 'card' }, list.length ? table(['Client', 'ID', 'Name', 'Category', 'Image'], productRows(list, true)) : empty('\uD83D\uDC55', 'No products yet.')));
  }
  async function settings() {
    const cur = el('input', { type: 'password', autocomplete: 'current-password' }), nw = el('input', { type: 'password', autocomplete: 'new-password' });
    content.replaceChildren(...head('Settings'), el('div', { class: 'card', style: { maxWidth: '460px' } }, el('h2', null, 'Account'), el('p', { class: 'muted' }, me.email),
      field('Current password', cur), field('New password (8+ characters)', nw),
      el('button', { class: 'btn primary', style: { marginTop: '14px' }, onclick: async () => { try { await api('POST', '/auth/change-password', { current_password: cur.value, new_password: nw.value }); toast('Password changed', 'ok'); cur.value = nw.value = ''; } catch (e) { toast(e.message, 'err'); } } }, 'Change password')));
  }

  const routes = { dashboard, clients, licenses, domains, products, settings };
  async function route() {
    renderSide();
    const [name, arg] = (location.hash.replace(/^#\//, '') || 'dashboard').split('/');
    try {
      if (name === 'clients' && arg) await clientDetail(Number(arg));
      else await (routes[name] || dashboard)();
    } catch (e) { content.replaceChildren(el('div', { class: 'card' }, empty('\u26A0\uFE0F', e.message))); }
  }

  (async function boot() {
    try {
      me = (await api('GET', '/auth/me')).user;
      if (me.role !== 'ADMIN') throw new Error('not admin');
    } catch (e) { location.href = 'login.html'; return; }
    shell();
    window.addEventListener('hashchange', route);
    route();
  })();
})();
