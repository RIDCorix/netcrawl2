---
name: render-video:page-turn
description: Generate 3D book page-turn transition clips between scenes using HTML/CSS + Playwright screen recording. Sub-skill of render-video.
---

# render-video:page-turn — 3D Page-Turn Transitions

Generate realistic book page-turn animations between consecutive scenes using CSS 3D transforms recorded by Playwright.

## Prerequisites

```bash
npm install playwright  # in the project directory
npx playwright install chromium
```

## How It Works

1. Create an HTML file with CSS 3D page-curl animation
2. For each pair of consecutive scenes, load the HTML with front/back images
3. Playwright records the animation as a video
4. FFmpeg converts to mp4

## HTML Template

Create `output/temp/page-turn.html`:

```html
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1920px; height: 1080px;
    overflow: hidden; background: #000;
    perspective: 2500px;
  }
  .page-back { position: absolute; width: 1920px; height: 1080px; z-index: 1; }
  .page-back img { width: 100%; height: 100%; object-fit: cover; }
  .page-front {
    position: absolute; width: 1920px; height: 1080px; z-index: 2;
    transform-origin: left center;
    animation: pageTurn var(--duration) ease-in-out forwards;
  }
  .page-front img { width: 100%; height: 100%; object-fit: cover; backface-visibility: hidden; }
  .page-front::after {
    content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background: linear-gradient(to left, rgba(0,0,0,0.3), rgba(0,0,0,0.05));
    backface-visibility: hidden;
  }
  .shadow-overlay {
    position: absolute; width: 1920px; height: 1080px; z-index: 3; pointer-events: none;
    animation: shadowMove var(--duration) ease-in-out forwards;
    background: linear-gradient(to right, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 15%);
    opacity: 0;
  }
  @keyframes pageTurn {
    0% { transform: rotateY(0deg); }
    5% { transform: rotateY(-2deg); }
    100% { transform: rotateY(-180deg); }
  }
  @keyframes shadowMove {
    0% { opacity: 0; } 10% { opacity: 1; } 90% { opacity: 0.3; } 100% { opacity: 0; }
  }
</style>
</head>
<body>
  <div class="book">
    <div class="page-back"><img id="img-back" /></div>
    <div class="page-front"><img id="img-front" /></div>
    <div class="shadow-overlay"></div>
  </div>
  <script>
    const p = new URLSearchParams(location.search);
    document.documentElement.style.setProperty('--duration', (p.get('duration')||'1.2')+'s');
    document.getElementById('img-front').src = p.get('front');
    document.getElementById('img-back').src = p.get('back');
  </script>
</body>
</html>
```

## CRITICAL: Resolution Matching

**The HTML viewport, image sizes, and final video MUST all be 1920x1080.**

If DALL-E images are 1792x1024, they get stretched to fill via `object-fit: cover` in the HTML. The Playwright viewport is set to 1920x1080, and the recorded video is 1920x1080. This ensures no resolution mismatch during transitions.

If you see visual glitches (black bars, stretching, snapping) during page turns, check:
1. Playwright viewport: `{ width: 1920, height: 1080 }`
2. Playwright recordVideo size: `{ width: 1920, height: 1080 }`
3. FFmpeg output: `-vf "scale=1920:1080"`

## Playwright Recording Script

```javascript
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

for (let i = 0; i < scenes.length - 1; i++) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: tempDir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  await page.goto(`file://${htmlPath}?front=file://${frontImg}&back=file://${backImg}&duration=1.2`);
  await page.waitForTimeout(1400); // animation + buffer
  await context.close();
  // Find .webm, convert to .mp4
}

await browser.close();
```

## FFmpeg Conversion

```bash
ffmpeg -y -i "{recorded.webm}" -t 1.2 \
  -c:v libx264 -pix_fmt yuv420p -r 30 \
  -vf "scale=1920:1080" \
  -an "{output.mp4}"
```

**No audio in transition clips** — silence is added during the compose step.

## Parameters

| Parameter | Default | Notes |
|---|---|---|
| Turn duration | 1.2s | Good for bedtime stories. Use 0.8s for faster pacing. |
| FPS | 30 | Smooth enough for the animation |
| Easing | ease-in-out | Natural page-turn feel |
