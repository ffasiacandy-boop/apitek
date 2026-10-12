(function () {
  const { el, api, toast, modal, confirm, field, badge, fmtDate, table, empty, spinner, yesNo } = VT;
  const root = document.getElementById('app');
  let state = null;

  const snippet = (p) => {
    const lines = ['<script src="' + state.sdkUrl + '"><\/script>', '<script>', 'VirtualTryOn.init({', '    license: "' + state.license.license_key + '",', '    product: {', '        id: "' + p.product_id + '",', '        name: "' + p.name.replace(/"/g, '\\"') + '",', '        category: "' + p.category + '",', '        garmentImage: "' + p.garment_image + '"' + (Object.keys(p.config).length ? ',' : '')];
    if (Object.keys(p.config).length) lines.push('        config: ' + JSON.stringify(p.config));
    lines.push('    },', '    trigger: "#virtual-try-on-btn"', '});', '<\/script>');
    return lines.join('\n');
  };

  async function productDialog(p) {
    const i = {
      id: el('input', { value: p ? p.product_id : '', disabled: !!p, maxlength: 64, placeholder: 'TS001' }),
      name: el('input', { value: p ? p.name : '', maxlength: 150, placeholder: 'Classic Black T-Shirt' }),
      cat: el('select', { value: p ? p.category : 'tshirt' }, state.categories.supported.map((c) => el('option', { value: c }, c === 'tshirt' ? 'T-Shirt' : c))),
      img: el('input', { value: p ? p.garment_image : '', placeholder: 'https://example.com/black-tshirt.png' }),
    };
    const cfg = (p && p.config) || {};
    const adv = {}; ['widthRatio', 'heightRatio', 'anchorX', 'anchorY', 'offsetX', 'offsetY'].forEach((k) => { adv[k] = el('input', { type: 'number', step: '0.01', value: cfg[k] === undefined ? '' : cfg[k], placeholder: 'default' }); });
    const body = el('div', null, field('Product ID', i.id), field('Product name', i.name), field('Category', i.cat), field('Garment image URL (transparent PNG)', i.img),
      el('details', { style: { marginTop: '12px' } }, el('summary', { class: 'muted' }, 'Calibration (optional)'),
        el('div', { class: 'row2' }, field('Width ratio', adv.widthRatio), field('Height ratio', adv.heightRatio), field('Anchor X', adv.anchorX), field('Anchor Y', adv.anchorY), field('Offset X', adv.offsetX), field('Offset Y', adv.offsetY))),
      p ? null : el('p', { class: 'muted small' }, 'Tip: use a PNG/SVG with a transparent background, cropped tightly around the garment.'));
    const ok = await modal(p ? 'Edit product' : 'Add product', body, [{ label: 'Cancel', value: false }, { label: 'Save', kind: 'primary', action: async () => {
      const config = {}; for (const k in adv) if (adv[k].value !== '') config[k] = Number(adv[k].value);
      const payload = { name: i.name.value, category: i.cat.value, garment_image: i.img.value, config };
      if (p) await api('PATCH', '/client/products/' + p.id, payload); else await api('POST', '/client/products', { ...payload, product_id: i.id.value });
      toast('Product saved', 'ok');
    } }]);
    if (ok) load();
  }

  async function addDomain() {
    const d = el('input', { placeholder: 'shop.example.com' });
    const ok = await modal('Request a domain', el('div', null, field('Domain', d), el('p', { class: 'muted small' }, 'New domains must be approved by the administrator before Try-On works on them.')),
      [{ label: 'Cancel', value: false }, { label: 'Add', kind: 'primary', action: async () => { await api('POST', '/client/domains', { domain: d.value }); toast('Domain submitted', 'ok'); } }]);
    if (ok) load();
  }

  function render() {
    const l = state.license;
    const status = l ? l.effective_status : null;
    const sel = el('select', { onchange: () => paintSnippet() }, state.products.map((p, idx) => el('option', { value: idx }, `${p.name} (${p.product_id})`)));
    const pre = el('pre', { class: 'code' });
    function paintSnippet() { const p = state.products[Number(sel.value)]; pre.textContent = p && l ? snippet(p) : ''; }
    paintSnippet();

    root.replaceChildren(
      el('div', { class: 'topnav' }, el('div', { class: 'brand', style: { color: 'var(--ink)', padding: 0 } }, el('div', { class: 'logo', style: { color: '#fff' } }, '\uD83D\uDC55'), 'Virtual Try-On'), el('div', { class: 'actions' }, el('span', { class: 'muted small', style: { alignSelf: 'center' } }, state.user.email), el('button', { class: 'btn sm', onclick: VT.logout }, 'Logout'))),
      el('div', { class: 'wrap' },
        el('div', { class: 'page-head' }, el('h1', null, 'Welcome, ' + state.client.company_name)),
        el('div', { class: 'grid two' },
          el('div', { class: 'card' }, el('h2', { style: { marginBottom: '12px' } }, 'Virtual Try-On'),
            l ? el('div', null, el('div', { class: 'bigstatus' }, badge(status)),
              status !== 'ACTIVE' ? el('p', { class: 'muted small', style: { marginTop: 0 } }, status === 'EXPIRED' ? 'Your license has expired. Contact us to renew.' : 'Try-On is currently switched off. Contact us for help.') : null,
              el('dl', { class: 'kv', style: { margin: 0 } }, el('dt', null, 'Plan'), el('dd', null, l.plan), el('dt', null, 'Expiry'), el('dd', null, fmtDate(l.expiry_date)), el('dt', null, 'License'), el('dd', { class: 'mono' }, l.license_key)))
              : empty('\u23F3', 'Your account is awaiting license activation by the administrator.')),
          el('div', { class: 'card' }, el('div', { class: 'page-head', style: { marginBottom: '8px' } }, el('h2', null, 'Allowed domains'), el('button', { class: 'btn sm', onclick: addDomain }, '+ Request')),
            state.domains.length ? table(['Domain', 'Status', ''], state.domains.map((d) => [d.domain, yesNo(d.verified, 'Approved', 'Pending'),
              d.verified ? '' : el('button', { class: 'btn sm danger', onclick: async () => { try { await api('DELETE', '/client/domains/' + d.id); load(); } catch (e) { toast(e.message, 'err'); } } }, 'Remove')])) : empty('\uD83C\uDF10', 'No domains yet.'))),
        el('div', { class: 'card' }, el('div', { class: 'page-head', style: { marginBottom: '8px' } }, el('h2', null, 'Products'), el('button', { class: 'btn primary sm', onclick: () => productDialog(null) }, '+ Add product')),
          state.products.length ? table(['Product', 'ID', 'Category', 'Actions'], state.products.map((p) => [p.name, el('span', { class: 'mono small' }, p.product_id), p.category,
            el('div', { class: 'actions' }, el('button', { class: 'btn sm', onclick: () => productDialog(p) }, 'Edit'),
              el('button', { class: 'btn sm danger', onclick: async () => { if (await confirm('Delete product?', p.name, { confirmText: 'Delete', danger: true })) { try { await api('DELETE', '/client/products/' + p.id); load(); } catch (e) { toast(e.message, 'err'); } } } }, 'Delete'))])) : empty('\uD83D\uDC55', 'Add your first product to get your integration code.')),
        el('div', { class: 'card' }, el('h2', null, 'Integration'),
          !l ? el('p', { class: 'muted' }, 'Integration code appears once your license is created.') : !state.products.length ? el('p', { class: 'muted' }, 'Add a product to generate its integration code.') : el('div', null,
            el('p', { class: 'muted small' }, 'Paste on the product page. Add a button with id="virtual-try-on-btn" (or call .open() yourself).'), field('Product', sel), pre,
            el('button', { class: 'btn primary', onclick: () => VT.copy(pre.textContent) }, 'Copy Integration Code')))));
  }

  async function load() {
    try {
      const [me, doms, prods] = await Promise.all([api('GET', '/client/me'), api('GET', '/client/domains'), api('GET', '/client/products')]);
      state = { ...me, domains: doms.domains, products: prods.products };
      render();
    } catch (e) { root.replaceChildren(el('div', { class: 'wrap' }, el('div', { class: 'card' }, empty('\u26A0\uFE0F', e.message)))); }
  }
  load();
})();
