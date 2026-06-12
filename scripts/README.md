# Social / icon asset generators

These two HTML files are the **sources** for the share image and app icons in `public/`.
They are rendered with a headless browser at exact pixel sizes (so the real Fredoka
font and brand CSS apply), then exported. Re-run only when the branding changes.

| Source | Render size | Exported to |
| --- | --- | --- |
| `og-card.html` | 1200×630 | `public/og-cover.jpg` (the link-preview card) |
| `icon.html` | 512×512 | `public/icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `favicon-32.png` |

`og-card.html` frames Robin's real photo in a circular medallion next to the branding.
The photo is a **build-only** asset — `scripts/robin-source.jpeg`, git-ignored and **not**
deployed, so the raw unbranded photo never ships; only the rendered `og-cover.jpg` (which
shows his face inside the branded card) goes public. To reframe the portrait, tweak the
`.portrait` `background-size` / `background-position` in `og-card.html`. To swap the photo,
drop a new file at `scripts/robin-source.jpeg`. Everything else (game pieces, logo) is
inline SVG, so it renders straight from `file://`.

The share image is versioned (`og-cover.jpg`, not the old `og-image.jpg`) because
WhatsApp/Telegram cache previews by URL; bump the filename again on any future redesign
to force their scrapers to refetch.

## Regenerate

```bash
# 1. screenshot each card at its native size (Chrome headless, devicePixelRatio 1).
#    --allow-file-access-from-files lets the page load the local robin-source.jpeg;
#    --virtual-time-budget lets the Fredoka webfont load before the shot. icon.html still
#    loads /public/favicon.svg, so serve the repo root for that one (python3 -m http.server)
#    and point Chrome at the URL.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --allow-file-access-from-files --window-size=1200,630 --virtual-time-budget=4000 \
  --screenshot=og-card-render.png "file://$PWD/og-card.html"   # icon.html → 512×512

# 2. optimize / resize into public/
sips -s format jpeg -s formatOptions 86 og-card-render.png --out ../public/og-cover.jpg
sips -z 192 192 icon-render.png --out ../public/icon-192.png
sips -z 180 180 icon-render.png --out ../public/apple-touch-icon.png
sips -z 32  32  icon-render.png --out ../public/favicon-32.png
cp icon-render.png ../public/icon-512.png
```

The `og:image` / `twitter:image` URLs in `index.html` are absolute
(`https://robin-games.netlify.app/og-cover.jpg`) because WhatsApp, Telegram and
X require absolute URLs. If the production domain changes, update those tags
(and `og:url` / `canonical`) to match.
