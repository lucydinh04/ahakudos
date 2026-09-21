# V28.30 — Hero background global CSS fix

## Root cause found
The homepage hero `background-image` CSS was accidentally nested inside the dynamic `<style>` returned by `adminQuality()`. That style only exists when the Admin Moderation page is rendered, so the employee homepage only saw the old navy fallback background.

## Fix
- Moved homepage hero CSS into a true global `<style id="v2830-global-home-fixes">` inside `<head>`.
- Moved shared recipient/greeting overrides that were trapped in the same admin-only style block into global scope too.
- Hero asset renamed to `public/backgrounds/home-launch-hero-v2830.png` to force a fresh static asset.
- Added build marker `data-ahakudos-build="V28.30-HERO-GLOBAL-FIX"`.
- Added an explicit no-store header for the V28.30 hero asset.

No Apps Script changes are required for this visual fix.
