# Integration guide

## 1. Add the snippet to the product page

```html
<button id="virtual-try-on-btn">Virtual Try-On</button>

<script src="https://cdn.mytryon.com/vto.js"></script>
<script>
VirtualTryOn.init({
    license: "VT-ABCD-1234",
    product: {
        id: "TS001",
        name: "Classic Black T-Shirt",
        category: "tshirt",
        garmentImage: "https://example.com/products/black-tshirt.png"
    },
    trigger: "#virtual-try-on-btn"      // optional; or call instance.open() yourself
});
</script>
```

`init()` returns a promise for `{ open(), close(), destroy(), ready }`.
Re-initialise (or `destroy()` then `init()`) when a single-page app changes product.

### Options
| Option | Notes |
|---|---|
| `license` | Public license ID from the dashboard. Safe to expose. |
| `product.id / name / category / garmentImage` | Required. `category` supports `tshirt`, `shirt`, `pant`, `saree`, `dress`, `kurti`, and `chudidar` (the last uses the kurti adapter). |
| `product.config` (or same keys directly on `product`) | Optional calibration: `widthRatio`, `heightRatio`, `anchorX`, `anchorY`, `offsetX`, `offsetY`. |
| `trigger` | CSS selector or element that opens the modal on click. |
| `apiUrl` | Override the license API origin (defaults to the build-time `SDK_API_URL`, then the origin the script was loaded from). |
| `assets` | `{ bundle, wasm, model }` URLs to self-host MediaPipe instead of jsDelivr / Google Storage. |

## 2. Garment image
Use a PNG/SVG with a **transparent background**, cropped tightly to the garment, front view, sleeves included.
The image must be served with CORS (`Access-Control-Allow-Origin: *`) for the *Capture* button to work; without it the try-on still works but screenshots are disabled.

### Calibration
Upper-body garments are fitted from shoulder/hip pose landmarks; pants are fitted from hip and leg landmarks. The point (`anchorX`, `anchorY`) of the garment image is pinned to the adapter-specific body anchor. Tweak `widthRatio` (wider/narrower), `heightRatio` (longer/shorter) and `offsetX/Y` (fractions of garment width) for each product image.

## 3. Requirements for the host page
* HTTPS (the camera API requires it; `localhost` is exempt).
* If you use a Content-Security-Policy allow: `script-src` + `connect-src` for your SDK/API hosts, `https://cdn.jsdelivr.net`, `https://storage.googleapis.com`;
  `worker-src blob:`, `'wasm-unsafe-eval'`. Not needed if you self-host and allow your own origin.
* The page's domain must be listed (and verified) under *Allowed domains* for the license.

## 4. Platform notes
* **React / Next.js:** load the script with `next/script` (`strategy="afterInteractive"`) or inject it in `useEffect`; call `VirtualTryOn.init` once the script has loaded.
* **Laravel / PHP / plain HTML:** paste the snippet in the product template, printing the product fields server-side.
* **Shopify / WooCommerce:** a theme-app-extension / plugin only needs to output the same snippet from product metadata. The SDK is the shared core; no wrapper is bundled in this MVP.

## 5. What users see
| Situation | Message |
|---|---|
| License disabled / suspended / not found, network + no cache | Virtual Try-On is currently unavailable. |
| Expired | Virtual Try-On access has expired. Please contact the store. |
| Domain not allowed | Virtual Try-On is not configured for this website. |
| Camera permission denied | Camera access is required for Virtual Try-On. Please allow camera permission and try again. |
