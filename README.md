# Splitbill

Phone-first PWA for splitting restaurant receipts fairly — item by item, with on-device OCR. No server.

## Features

- Photograph a receipt or pick from gallery
- Client-side OCR (Tesseract.js) + editable line items
- Assign people per item; skippers are not charged
- Tax & tip split proportionally to each person’s subtotal
- Installable static PWA; state in `localStorage`

## Develop

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
npm run preview
```

## Deploy (static)

Build outputs to `dist/`. Host that folder anywhere static:

**GitHub Pages**

Pushes to `main` deploy via GitHub Actions to:

`https://<your-username>.github.io/splitbill/`

Local production build for that path:

```bash
GITHUB_PAGES=1 npm run build
```

**Cloudflare Pages**

```bash
npm run build
npx wrangler pages deploy dist --project-name=splitbill
```

Or connect the repo in the Cloudflare dashboard with build command `npm run build` and output directory `dist`.

**Netlify**

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

## Design

Product UI follows Impeccable (`PRODUCT.md`, `DESIGN.md`). Warm paper atmosphere, Newsreader + Source Sans 3, green money accent.

## OCR notes

The app uses **PaddleOCR** in the browser (not a vision chat model). It reads characters from pixels; purple venue lighting and curved paper still cause typos. Always review the Items step. After `npm install`, `postinstall` patches a Vite/clipper-lib interop issue in `@paddleocr/paddleocr-js`.
