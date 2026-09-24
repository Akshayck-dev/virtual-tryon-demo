# TryOn Studio — AI Virtual Try-On Demo

A working demo of an AI virtual try-on website, inspired by viral "virtual try-on for
clothing brands" reels. Pick a garment, upload your photo, and a generative image
model (Google Gemini `gemini-3.1-flash-image`) renders you wearing it.

## Run it

This is a plain static site — no build step. Serve it over HTTP (required, because
the studio fetches the garment images via JavaScript):

```bash
cd virtual-tryon-demo
python3 -m http.server 8000
```

Then open http://localhost:8000 — home page at `/`, the studio at `/studio.html`.

> Opening the `.html` files directly via `file://` will break the try-on step
> (browsers block `fetch()` of local files). The home page works either way.

## What you need

Nothing — the studio opens in **⚡ Instant demo** mode with pre-generated
try-on previews for all 6 garments (`assets/pregen/tryon-*.jpg`), no key or
upload needed.

**🆓 Free AI** generates a fresh try-on live on our model photo via
[Pollinations](https://enter.pollinations.ai/keys) (free API key, no card).
Paste the key in the studio — it's saved only in your browser's localStorage.

**🤖 Live AI** tries garments on your own photo: paste a **free Gemini API
key** from [Google AI Studio](https://aistudio.google.com/apikey) in step 3
(saved only in your browser's localStorage, sent only to Google's API).
Note: the key needs image-generation quota on its Google Cloud project —
without it the API returns a 429 error.

## How it works

**Instant demo:** the selected garment's pre-generated preview
(`garment.pregen` in `assets/garments.js`) is shown immediately, labeled as a
demo preview.

**Live AI:**
1. Your photo is downscaled (max 1024px) in the browser.
2. The selected garment's product photo is read as base64.
3. Both images + a try-on instruction are POSTed to
   `generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent`.
4. The returned image is displayed with a download button.

## Files

- `index.html` — landing page (hero, how-it-works, catalog, for-brands)
- `studio.html` — the try-on studio
- `app.js` — studio logic (upload, API call, result rendering)
- `styles.css` — all styling
- `assets/garments.js` — shared garment catalog (edit to add your own products)
- `assets/garment-*.jpg` — 6 demo product photos (AI-generated placeholders)
- `assets/sample-tryon-result.jpg` — pre-generated sample result (brown leather jacket, used on the home page hero)
- `assets/pregen/tryon-*.jpg` — pre-generated try-on previews for all 6 garments (Instant demo mode)

## Taking it further (for a real brand)

- **Swap in real product photos** — replace the `assets/garment-*.jpg` files and
  update `assets/garments.js`.
- **Backend proxy** — move the Gemini call to a small server (Node/Python) so the
  API key isn't exposed in client-side code, add rate limiting and per-user quotas.
- **Shopify integration** — add a "Try it on" button on product pages that opens
  this studio pre-selected with that product (`studio.html?g=<product-id>`).
- **Better results** — use a dedicated virtual-try-on model (e.g. via Replicate)
  instead of the general image model for more consistent garment fidelity.
