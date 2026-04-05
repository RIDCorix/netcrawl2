---
name: render-video:dalle-image
description: Generate images using OpenAI DALL-E 3 HD API with strict style consistency. Sub-skill of render-video. Replaces render-video:replicate-image.
---

# render-video:dalle-image — Image Generation via DALL-E 3

Generate scene images using the OpenAI DALL-E 3 API with enforced style consistency.

## Style Consistency Protocol

**DALL-E 3 rewrites your prompt internally.** Without strict constraints, every image will look different. The solution:

### 1. Build a Style Prefix (do this ONCE before any generation)

Construct a ~100-word style prefix that covers:

```
{rendering technique}, {art tradition}, {color palette with specific colors},
{character physical description with proportion constraints},
{explicit negative constraints}, {composition rules}
```

Example:
```
Detailed digital painting in the style of a classic European children's
storybook illustration. Soft painterly brushstrokes with visible texture.
Muted jewel-tone palette dominated by deep midnight blues, soft silvers,
and warm golden starlight. Atmospheric perspective with dreamy bokeh.
The white rabbit Luna is SMALL and delicate with realistic proportions —
she is a tiny bunny in a vast magical world, NOT a cartoon character,
NOT chibi, NOT kawaii, NOT big-headed. Cinematic wide composition.
No text, no borders, no frames, no film grain.
```

### 2. Construct Every Prompt As

```
{stylePrefix} Scene: {scene-specific description stripped of generic style words}
```

Strip these from scene prompts before prepending prefix (to avoid conflicts):
- "children's book illustration"
- "whimsical storybook art"
- "consistent character design"
- "landscape WxH"

### 3. Post-Generation Review

After generating all images, visually inspect each one. Flag any that:
- Have a different art style (chibi, 3D render, flat vector, etc.)
- Show the character with wrong proportions (big head, cartoon eyes)
- Use a different color palette
- Have borders, frames, or film grain artifacts

Regenerate flagged images with the same prefix + rephrased scene description.

## API Call

Write request body to a temp file (avoids shell escaping issues):

```bash
cat > output/temp/dalle-{scene-id}.json << 'REQEOF'
{
  "model": "dall-e-3",
  "prompt": "{stylePrefix} Scene: {scene description}",
  "n": 1,
  "size": "1792x1024",
  "quality": "hd",
  "style": "vivid"
}
REQEOF

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer {OPENAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @"output/temp/dalle-{scene-id}.json"
```

### Response

```json
{
  "data": [{
    "url": "https://oaidalleapiprodscus.blob.core.windows.net/...",
    "revised_prompt": "..."
  }]
}
```

Download the image:
```bash
curl -s -o "output/images/{scene-id}.png" "{url}"
```

**Note:** `revised_prompt` shows how DALL-E 3 rewrote your prompt. Check this — if it dropped your style constraints, your prefix isn't strong enough.

## Parameters

| Parameter | Value | Notes |
|---|---|---|
| `model` | `dall-e-3` | Only model that supports HD |
| `size` | `1792x1024` | Landscape, closest to 16:9. Gets upscaled to 1920x1080 by FFmpeg in compose. |
| `quality` | `hd` | More detail, better for storybook art. ~$0.08/image |
| `style` | `vivid` | More dramatic/artistic. Use `natural` for realistic photos. |

## Rate Limits

- DALL-E 3: ~5 images/minute (with standard API tier)
- Add `sleep 13` between requests to stay safe
- If rate limited, the API returns `429` with `retry-after` header

## Common Issues

- **Style inconsistency**: Prefix not specific enough. Add more constraints.
- **Film grain / borders**: Add "No film grain, no borders, no vignette" to prefix.
- **Character becomes chibi**: Add explicit "NOT chibi, NOT kawaii, realistic proportions, small rabbit in vast landscape" — repeat it.
- **DALL-E refuses prompt**: It has content policy filters. Rephrase violence/scary content as gentle/dreamy.
- **Image has text in it**: Add "No text, no words, no letters, no watermarks" to prefix.
