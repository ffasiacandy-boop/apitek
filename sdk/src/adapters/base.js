import { OneEuro } from '../smoothing.js';

export const DEFAULT_CALIBRATION = { widthRatio: 1, heightRatio: 1, anchorX: 0.5, anchorY: 0.35, offsetX: 0, offsetY: 0 };

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const attempt = (cors) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ img, tainted: !cors });
      img.onerror = () => (cors ? attempt(false) : reject(Object.assign(new Error('image'), { code: 'IMAGE' })));
      img.src = url;
    };
    attempt(true);
  });
}

/**
 * Base class for every garment category. To add a category (pant, kurti, saree...):
 *   1. extend GarmentAdapter and implement fit(pose) -> { cx, cy, width, angle } | null
 *   2. register it in adapters/index.js
 *   3. add it to SUPPORTED_CATEGORIES in server/src/utils/catalog.js
 * Calibration (widthRatio, heightRatio, anchorX, anchorY, offsetX, offsetY) is shared by all adapters.
 */
export class GarmentAdapter {
  static category = 'base';
  static defaults = {};

  constructor(product) {
    this.product = product;
    const src = { ...product, ...(product.config || {}) };
    this.cal = { ...DEFAULT_CALIBRATION, ...this.constructor.defaults };
    for (const k of Object.keys(DEFAULT_CALIBRATION)) {
      const n = Number(src[k]);
      if (src[k] !== undefined && src[k] !== null && src[k] !== '' && Number.isFinite(n)) this.cal[k] = n;
    }
    this.image = null; this.tainted = false;
    this.reset();
  }

  reset() {
    this.f = {
      cx: new OneEuro({ minCutoff: 1.5, beta: 8 }), cy: new OneEuro({ minCutoff: 1.5, beta: 8 }),
      w: new OneEuro({ minCutoff: 1.0, beta: 4 }), a: new OneEuro({ minCutoff: 1.2, beta: 0.5 }),
    };
    this.current = null;
  }

  async load() {
    if (this.image) return;
    const { img, tainted } = await loadImage(this.product.garmentImage);
    this.image = img; this.tainted = tainted;
  }

  /** Subclasses return the raw (unsmoothed) placement in canvas pixels, or null when the body isn't usable. */
  fit() { throw new Error('GarmentAdapter.fit() must be implemented by the category adapter'); }

  update(pose, t) {
    const raw = pose ? this.fit(pose) : null;
    if (!raw) return null;
    const u = pose.width || 1;                          // filter in normalized units so tuning is resolution independent
    this.current = {
      cx: this.f.cx.filter(raw.cx / u, t) * u, cy: this.f.cy.filter(raw.cy / u, t) * u,
      width: this.f.w.filter(raw.width / u, t) * u, angle: this.f.a.filter(raw.angle, t),
    };
    return this.current;
  }

  draw(ctx, alpha) {
    const t = this.current;
    if (!t || !this.image || alpha < 0.02) return;
    const w = t.width;
    const h = w * (this.image.naturalHeight / this.image.naturalWidth) * this.cal.heightRatio;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(t.cx, t.cy);
    ctx.rotate(t.angle);
    ctx.drawImage(this.image, -this.cal.anchorX * w, -this.cal.anchorY * h, w, h);
    ctx.restore();
  }
}
