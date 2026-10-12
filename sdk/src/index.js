import { MSG, messageForCode } from './messages.js';
import { createLicenseClient } from './license.js';
import { Camera } from './camera.js';
import { PoseTracker } from './pose.js';
import { Renderer } from './renderer.js';
import { getAdapter, supportedCategories } from './adapters/index.js';
import { TryOnModal } from './ui/modal.js';

/* global __VTO_API_URL__ */
const BUILD_API_URL = typeof __VTO_API_URL__ === 'string' ? __VTO_API_URL__ : '';
const SCRIPT_ORIGIN = (() => { try { return new URL(document.currentScript.src).origin; } catch { return ''; } })();
const LICENSE_RE = /^VT-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
const log = (...a) => console.error('[VirtualTryOn]', ...a);

function checkConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return 'init() needs a configuration object.';
  if (typeof cfg.license !== 'string' || !LICENSE_RE.test(cfg.license.trim())) return 'Invalid "license" (expected VT-XXXX-0000).';
  const p = cfg.product;
  if (!p || typeof p !== 'object') return 'Missing "product".';
  for (const k of ['id', 'name', 'category', 'garmentImage']) if (typeof p[k] !== 'string' || !p[k].trim()) return `product.${k} is required.`;
  return null;
}

function cameraErrorMessage(e) {
  switch (e && e.name) {
    case 'NotAllowedError': case 'SecurityError': case 'PermissionDeniedError': return MSG.permission;
    case 'NotReadableError': case 'AbortError': return MSG.cameraBusy;
    default: return MSG.noCamera;
  }
}

function createInstance(cfg) {
  const configError = checkConfig(cfg);
  if (configError) log(configError);
  const product = configError ? null : { ...cfg.product, garmentImage: new URL(cfg.product.garmentImage, location.href).href };
  const apiUrl = (cfg && cfg.apiUrl) || BUILD_API_URL || SCRIPT_ORIGIN;
  const licenseClient = configError ? null : createLicenseClient({ apiUrl, license: cfg.license.trim().toUpperCase() });

  let modal = null, camera = null, tracker = null, renderer = null, adapter = null;
  let opened = false, running = false, destroyed = false, raf = 0, facing = 'user', lastBlob = null;
  let lastVideoTime = -1, lastDetect = 0, infMs = 0, interval = 0, seen = 0, lastSeen = 0, state = 'info';
  const AdapterClass = product ? getAdapter(product.category) : null;
  const triggers = [];

  function ensureModal() {
    if (modal) return;
    modal = new TryOnModal({
      onClose: close, onStart: startCamera, onStop: stopCamera, onSwitch: switchCamera, onCapture: capture,
      onRetry: () => { camera && camera.stop(); modal.screen('intro'); },
      onRetake: resume, onDownload: download,
    });
    camera = new Camera(modal.video);
    renderer = new Renderer(modal.canvas);
  }

  async function open() {
    if (destroyed || opened) return;
    opened = true;
    ensureModal();
    modal.show(product ? product.name : '');
    modal.screen('loading', MSG.loading);
    if (configError) return modal.error(MSG.unavailable, { retry: false });
    const res = await licenseClient.validate();       // authoritative backend check on every open
    if (!opened) return;
    if (!res.ok) return modal.error(res.message || messageForCode(res.code), { retry: false });
    if (!AdapterClass) { log(`Unsupported category "${product.category}". Supported: ${supportedCategories().join(', ')}`); return modal.error(MSG.unsupportedCategory, { retry: false }); }
    if (!Camera.supported()) return modal.error(MSG.unsupportedBrowser, { retry: false });
    modal.screen('intro');
  }

  async function ensureTracker() {
    if (!tracker) tracker = new PoseTracker(cfg.assets);
    await tracker.load();
  }

  async function startCamera() {
    if (running) return;
    modal.screen('loading', MSG.loading);
    const trackerReady = ensureTracker(); trackerReady.catch(() => {});   // load AI while the permission prompt is open
    try { await camera.start(facing); } catch (e) { return modal.error(cameraErrorMessage(e)); }
    if (!opened) { camera.stop(); return; }
    try {
      if (!adapter) adapter = new AdapterClass(product);
      await Promise.all([adapter.load(), trackerReady]);
    } catch (e) {
      camera.stop();
      return modal.error(e && e.code === 'IMAGE' ? MSG.imageFail : MSG.modelFail);
    }
    if (!opened) { camera.stop(); return; }
    begin();
    modal.showSwitch(await camera.hasMultiple());
  }

  function begin() {
    renderer.setMirror(camera.mirrored);
    adapter.reset();
    modal.screen('live');
    modal.status('info', MSG.stand);
    state = 'info'; seen = 0; lastSeen = performance.now(); lastVideoTime = -1; lastDetect = 0; infMs = 0; interval = 0;
    running = true;
    raf = requestAnimationFrame(loop);
  }

  function makePose(lm) {
    return {
      width: renderer.cw, height: renderer.ch,
      get(i) {
        const p = lm[i];
        if (!p || (p.visibility !== undefined && p.visibility < 0.5)) return null;
        if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) return null;
        const c = renderer.toCanvas(p.x, p.y);
        return { x: c.x, y: c.y };
      },
    };
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const v = camera.video;
    if (v.readyState < 2 || !v.videoWidth || v.currentTime === lastVideoTime) return;   // draw only on new camera frames
    lastVideoTime = v.currentTime;
    renderer.layout(v);

    if (now - lastDetect >= interval) {                 // adaptive frame skipping: slower devices detect less often
      lastDetect = now;
      const t0 = performance.now();
      let lm = null;
      try { lm = tracker.detect(v); } catch { /* skip this frame */ }
      const dt = performance.now() - t0;
      infMs = infMs ? infMs * 0.8 + dt * 0.2 : dt;
      interval = infMs < 22 ? 0 : infMs < 40 ? 33 : infMs < 70 ? 66 : 100;     // ~30 / 20 / 12 / 8 detections per second
      const t = adapter.update(lm ? makePose(lm) : null, now / 1000);
      if (t) {
        lastSeen = now; seen += 1;
        if (seen >= 3 && state !== 'ok') { state = 'ok'; modal.status('ok', MSG.ready); }
      } else {
        seen = 0;
        if (now - lastSeen > 600 && state !== 'warn') { state = 'warn'; modal.status('warn', MSG.move); }
      }
    }
    renderer.draw(v, adapter, now - lastSeen < 600);
  }

  function pause() { running = false; cancelAnimationFrame(raf); }
  function resume() { if (!camera.stream) return; modal.screen('live'); running = true; lastVideoTime = -1; raf = requestAnimationFrame(loop); }

  function stopCamera() { pause(); camera.stop(); modal.screen('intro'); }

  async function switchCamera() {
    const next = facing === 'user' ? 'environment' : 'user';
    pause();
    try { await camera.start(next); facing = next; } catch { try { await camera.start(facing); } catch (e) { return modal.error(cameraErrorMessage(e)); } modal.toast('Could not switch camera.'); }
    begin();
  }

  function capture() {
    try {
      renderer.canvas.toBlob((blob) => {
        if (!blob) return modal.toast(MSG.captureFail);
        if (lastBlob) URL.revokeObjectURL(lastBlob.url);
        lastBlob = { blob, url: URL.createObjectURL(blob) };
        pause();
        modal.preview(lastBlob.url);
      }, 'image/png');
    } catch { modal.toast(MSG.captureFail); }     // canvas tainted by a cross-origin image without CORS headers
  }

  function download() {      // stays on the device: a local file download, nothing is uploaded
    if (!lastBlob) return;
    const a = document.createElement('a');
    a.href = lastBlob.url; a.download = `try-on-${product.id}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function close() {
    if (!opened) return;
    opened = false; pause();
    if (camera) camera.stop();
    if (lastBlob) { URL.revokeObjectURL(lastBlob.url); lastBlob = null; }
    if (modal) modal.hide();
  }

  function destroy() {
    close(); destroyed = true;
    triggers.forEach(([el, fn]) => el.removeEventListener('click', fn));
    if (tracker) tracker.close();
    if (modal) modal.destroy();
  }

  function bindTrigger(t) {
    const els = typeof t === 'string' ? document.querySelectorAll(t) : t instanceof Element ? [t] : [];
    els.forEach((el) => { const fn = (e) => { e.preventDefault(); open(); }; el.addEventListener('click', fn); triggers.push([el, fn]); });
  }
  if (cfg && cfg.trigger) bindTrigger(cfg.trigger);

  // Early, silent validation so integrators can see problems; open() always re-validates.
  const ready = licenseClient ? licenseClient.validate().then((r) => { if (!r.ok) log(`License check failed (${r.code}).`); return r.ok; }) : Promise.resolve(false);

  return { open, close, destroy, ready };
}

const VirtualTryOn = {
  version: '1.0.0',
  /** @returns {Promise<{open:Function, close:Function, destroy:Function}>} */
  async init(config) { return createInstance(config); },
};
window.VirtualTryOn = VirtualTryOn;
