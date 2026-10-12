const express = require('express');
const cfg = require('../config');
const db = require('../db');
const logger = require('../utils/logger');
const { ok, wrap, AppError } = require('../utils/respond');
const v = require('../utils/validate');
const { CALIBRATION_RANGES, SUPPORTED_CATEGORIES, PLANNED_CATEGORIES } = require('../utils/catalog');
const { authenticate, requireClient, csrfGuard } = require('../middleware/auth');
const { listLicenses } = require('../services/license');
const { addDomain, parseProduct } = require('../services/accounts');

const r = express.Router();
r.use(authenticate, csrfGuard, requireClient);

const sdkUrl = () => `${cfg.sdkCdnUrl || ''}/vto.js`;
const myLicenses = (clientId) => listLicenses('WHERE l.client_id = ?', [clientId]);

// NOTE: there is intentionally no route here that changes license status, plan or expiry.
r.get('/me', wrap(async (req, res) => {
  const licenses = myLicenses(req.client.id);
  ok(res, {
    user: req.user,
    client: { id: req.client.id, company_name: req.client.company_name, phone: req.client.phone },
    license: licenses[0] || null,
    sdkUrl: sdkUrl(),
    categories: { supported: SUPPORTED_CATEGORIES, planned: PLANNED_CATEGORIES },
  });
}));

r.get('/license', wrap(async (req, res) => {
  const licenses = myLicenses(req.client.id);
  ok(res, { license: licenses[0] || null, licenses, sdkUrl: sdkUrl() });
}));

// Domains: clients may request domains; they only take effect once an admin verifies them.
r.get('/domains', wrap(async (req, res) => {
  ok(res, { domains: db.prepare('SELECT * FROM domains WHERE client_id = ? ORDER BY id').all(req.client.id) });
}));
r.post('/domains', wrap(async (req, res) => {
  const domain = v.normalizeDomain((req.body || {}).domain);
  if (!domain) throw v.bad('Please enter a valid domain such as shop.example.com');
  if (db.prepare('SELECT COUNT(*) AS n FROM domains WHERE client_id = ?').get(req.client.id).n >= 10) throw new AppError(400, 'LIMIT', 'Domain limit reached. Contact the administrator.');
  ok(res, { domain: addDomain(req.client.id, domain, false) }, 201);
}));
r.delete('/domains/:id', wrap(async (req, res) => {
  const d = db.prepare('SELECT * FROM domains WHERE id = ? AND client_id = ?').get(v.reqId(req.params.id), req.client.id);
  if (!d) throw new AppError(404, 'NOT_FOUND', 'Domain not found.');
  if (d.verified) throw new AppError(403, 'FORBIDDEN', 'Verified domains can only be removed by the administrator.');
  db.prepare('DELETE FROM domains WHERE id = ?').run(d.id);
  ok(res, {});
}));

// Products
function parseConfig(c) {
  if (c === undefined || c === null) return {};
  if (typeof c !== 'object' || Array.isArray(c)) throw v.bad('Calibration must be an object.');
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(CALIBRATION_RANGES)) {
    if (c[k] === undefined || c[k] === null || c[k] === '') continue;
    const n = Number(c[k]);
    if (!Number.isFinite(n) || n < lo || n > hi) throw v.bad(`${k} must be between ${lo} and ${hi}.`);
    out[k] = n;
  }
  return out;
}
function reqCategory(c) {
  const s = String(c || '').toLowerCase();
  if (!SUPPORTED_CATEGORIES.includes(s)) throw v.bad(`Category must be one of: ${SUPPORTED_CATEGORIES.join(', ')}.`);
  return s;
}
r.get('/products', wrap(async (req, res) => {
  ok(res, { products: db.prepare('SELECT * FROM products WHERE client_id = ? ORDER BY id DESC').all(req.client.id).map(parseProduct) });
}));
r.post('/products', wrap(async (req, res) => {
  const b = req.body || {};
  const p = {
    product_id: v.reqProductId(b.product_id), name: v.reqString(b.name, 'Product name', { max: 150 }),
    category: reqCategory(b.category), garment_image: v.reqUrl(b.garment_image, 'Garment image URL'), config: parseConfig(b.config),
  };
  if (db.prepare('SELECT 1 FROM products WHERE client_id = ? AND product_id = ?').get(req.client.id, p.product_id)) throw new AppError(409, 'PRODUCT_EXISTS', 'A product with this ID already exists.');
  const now = v.nowIso();
  const info = db.prepare('INSERT INTO products (client_id, product_id, name, category, garment_image, config_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.client.id, p.product_id, p.name, p.category, p.garment_image, JSON.stringify(p.config), now, now);
  ok(res, { product: parseProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)) }, 201);
}));
r.patch('/products/:id', wrap(async (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ? AND client_id = ?').get(v.reqId(req.params.id), req.client.id);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  const b = req.body || {};
  const next = {
    name: b.name !== undefined ? v.reqString(b.name, 'Product name', { max: 150 }) : row.name,
    category: b.category !== undefined ? reqCategory(b.category) : row.category,
    garment_image: b.garment_image !== undefined ? v.reqUrl(b.garment_image, 'Garment image URL') : row.garment_image,
    config_json: b.config !== undefined ? JSON.stringify(parseConfig(b.config)) : row.config_json,
  };
  db.prepare('UPDATE products SET name=?, category=?, garment_image=?, config_json=?, updated_at=? WHERE id=?').run(next.name, next.category, next.garment_image, next.config_json, v.nowIso(), row.id);
  ok(res, { product: parseProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(row.id)) });
}));
r.delete('/products/:id', wrap(async (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ? AND client_id = ?').run(v.reqId(req.params.id), req.client.id);
  if (!info.changes) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  logger.info('product_deleted', { clientId: req.client.id });
  ok(res, {});
}));

module.exports = r;
