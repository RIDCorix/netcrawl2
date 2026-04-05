---
name: render-video:tts
description: Generate speech audio from text using ElevenLabs or OpenAI TTS API via curl. Sub-skill of render-video.
---

# render-video:tts — Text-to-Speech

Generate an MP3 audio file from narration text. Supports ElevenLabs and OpenAI TTS.

## Choosing a Provider

Read the `.env` file next to `scenes.json`. Use the first available:

1. **ElevenLabs** — if `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` are set
2. **OpenAI** — if `OPENAI_API_KEY` is set

## ElevenLabs

```bash
curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}" \
  -H "xi-api-key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "{narration text}",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.8,
      "similarity_boost": 0.75,
      "style": 0.2,
      "use_speaker_boost": true
    }
  }' \
  --output "output/audio/{scene-id}.mp3"
```

**Notes:**
- The response body IS the audio file (binary MP3), not JSON
- For bedtime stories, use `stability: 0.8` and `style: 0.2` for calm, consistent narration
- For energetic narration (dev logs), use `stability: 0.5` and `style: 0.5`
- If the output file is suspiciously small (<1KB), the API likely returned an error — read it as text to diagnose

### Finding a voice ID

To list available voices:
```bash
curl -s "https://api.elevenlabs.io/v1/voices" \
  -H "xi-api-key: {API_KEY}" | python3 -c "
import json,sys
for v in json.load(sys.stdin)['voices']:
  print(f\"{v['voice_id']}  {v['name']}  ({v.get('labels',{}).get('accent','')})\")"
```

## OpenAI TTS

```bash
curl -s -X POST "https://api.openai.com/v1/audio/speech" \
  -H "Authorization: Bearer {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1-hd",
    "input": "{narration text}",
    "voice": "{voice name}",
    "speed": 0.85
  }' \
  --output "output/audio/{scene-id}.mp3"
```

**Available voices:** `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

**Recommended:**
- Bedtime stories: `onyx` or `fable` at speed `0.85`
- Energetic narration: `onyx` or `echo` at speed `1.0`
- The `OPENAI_TTS_VOICE` env var overrides the default

**Notes:**
- Response is binary audio (MP3 by default)
- `tts-1-hd` is higher quality; use `tts-1` for faster/cheaper
- For long narration (>4096 chars), split into chunks at sentence boundaries and concatenate with FFmpeg:
  ```bash
  ffmpeg -y -i "concat:chunk1.mp3|chunk2.mp3" -c copy output.mp3
  ```

## Important

- Write the request body to a temp file and use `-d @tempfile.json` instead of inline JSON — this avoids shell escaping issues with quotes and special characters in narration text
- Always verify the output file exists and is >1KB after the curl call
- If a scene's narration contains `...` (ellipsis), these are intentional pauses — both providers handle them naturally
