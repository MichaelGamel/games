# Social / icon asset generators

These two HTML files are the **sources** for the share image and app icons in `public/`.
They are rendered with a headless browser at exact pixel sizes (so the real Fredoka
font and brand CSS apply), then exported. Re-run only when the branding changes.

| Source | Render size | Exported to |
| --- | --- | --- |
| `og-card.html` | 1200×630 | `public/og-image.jpg` (the link-preview card) |
| `icon.html` | 512×512 | `public/icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `favicon-32.png` |

`og-card.html` frames a real board screenshot (`/hostA.png`) next to the title; adjust the
`.board-img` `background-size` / `background-position` to reframe the crop.

## Regenerate

```bash
# 1. serve the repo root so the HTML can load /hostA.png and /public/favicon.svg
python3 -m http.server 8799 --directory . &

# 2. screenshot each card at its native size (Chrome headless, devicePixelRatio 1)
#    e.g. with Playwright: set viewport to the render size, goto the URL, page.screenshot()
#    og-card.html → 1200×630, icon.html → 512×512

# 3. optimize / resize into public/
sips -s format jpeg -s formatOptions 82 og-card-render.png --out ../public/og-image.jpg
sips -z 192 192 icon-render.png --out ../public/icon-192.png
sips -z 180 180 icon-render.png --out ../public/apple-touch-icon.png
sips -z 32  32  icon-render.png --out ../public/favicon-32.png
cp icon-render.png ../public/icon-512.png
```

The `og:image` / `twitter:image` URLs in `index.html` are absolute
(`https://robin-games.netlify.app/og-image.jpg`) because WhatsApp, Telegram and
X require absolute URLs. If the production domain changes, update those tags
(and `og:url` / `canonical`) to match.
