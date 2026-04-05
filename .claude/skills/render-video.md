---
name: render-video
description: Render a bedtime story (or any scene-based narrative) into a complete video. Orchestrates art direction, TTS, image generation, page-turn transitions, karaoke subtitles, and FFmpeg composition — all via API calls and CLI tools.
---

# /render-video — Scene-Based Video Pipeline

Render a `scenes.json` project into a complete video. You (Claude) operate each tool directly via `curl`, `ffmpeg`, and `playwright`.

## Usage

```
/render-video                           # render the current project (auto-detect scenes.json)
/render-video <path-to-scenes.json>     # render a specific project
/render-video --step tts                # run only one step
/render-video --step images --from 5    # generate images starting from scene 5
```

## Prerequisites

The user must have a `.env` file next to their `scenes.json` with API keys:

- `OPENAI_API_KEY` — for DALL-E 3 image generation + TTS
- (Optional) `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` — for higher quality TTS
- FFmpeg installed (`brew install ffmpeg`)
- Playwright installed for page-turn transitions (`npm install playwright`)

## scenes.json Format

```json
{
  "title": "Story Title",
  "style": {
    "prefix": "Detailed digital painting in the style of...",
    "character": "a small white bunny with realistic proportions...",
    "palette": "deep midnight blues, soft silvers, warm golden starlight",
    "negative": "NOT cartoon, NOT chibi, NOT kawaii, NOT big-headed"
  },
  "resolution": { "width": 1920, "height": 1080 },
  "subtitles": { "style": "karaoke", "font": "EB Garamond", ... },
  "audio": {
    "bgm": { "query": "cozy music box lullaby", "gain": 0.1, "loop": true }
  },
  "scenes": [
    { "id": "cover", "type": "title-card", "duration": 3, "imagePrompt": "..." },
    { "id": "scene-01", "narration": "...", "imagePrompt": "..." },
    ...
  ]
}
```

## Execution Steps

Execute steps **in order**. Cache aggressively — skip files that already exist.

```bash
mkdir -p output/{audio,images,transitions,temp} media
```

### Step 0: Art Direction — Define Style Before Anything Else

**CRITICAL — Do this FIRST before generating any images.**

Define a `stylePrefix` string that will be prepended to EVERY image prompt. This prefix MUST include:

1. **Rendering technique** — e.g., "Detailed digital painting with soft painterly brushstrokes"
2. **Art tradition** — e.g., "in the style of a classic European children's storybook illustration"
3. **Color palette** — specific colors, e.g., "muted jewel-tone palette dominated by deep midnight blues, soft silvers, and warm golden starlight"
4. **Character description** — VERY specific physical description of the protagonist with explicit proportion constraints, e.g., "The white rabbit Luna is SMALL and delicate with realistic proportions — she is a tiny bunny in a vast magical world"
5. **Negative style constraints** — explicitly ban unwanted styles, e.g., "NOT cartoon, NOT chibi, NOT kawaii, NOT big-headed, NOT 3D render"
6. **Composition** — e.g., "Cinematic wide composition. No text, no borders, no frames, no film grain."

Store this in `scenes.json` under `style.prefix` or construct it from `style.*` fields.

**Why this matters:** Without a locked style prefix, DALL-E 3 will interpret each prompt independently and produce wildly inconsistent art styles across scenes — some realistic, some chibi, some 3D. The prefix forces every generation through the same style constraints.

### Step 1: TTS — Generate Narration Audio

For each scene with `narration`, generate `output/audio/{scene-id}.mp3`.

Use sub-skill **`render-video:tts`**.

### Step 2: Images — Generate Scene Images (DALL-E 3)

For each scene with `imagePrompt`, generate `output/images/{scene-id}.png`.

Use sub-skill **`render-video:dalle-image`**.

**Every prompt MUST be constructed as:** `{stylePrefix} Scene: {scene.imagePrompt}`

After generating all images, do a **visual consistency review**:
- Open/inspect each generated image
- Flag any that deviate from the established style
- Regenerate flagged images (same prefix, rephrased scene description)

### Step 3: Transitions — Page-Turn Animations

Generate page-turn transition clips between each pair of consecutive scenes using sub-skill **`render-video:page-turn`**.

Output: `output/transitions/turn-{fromId}-to-{toId}.mp4`

**Important:** Transition clips MUST match the scene image resolution exactly (1920x1080). Mismatched dimensions cause visual glitches during the turn animation.

### Step 4: Subtitles — Karaoke ASS

Generate `output/subtitles.ass` using sub-skill **`render-video:subtitles`**.

Use `ffprobe` for actual TTS audio durations when available.

### Step 5: Compose — FFmpeg Assembly

Assemble everything using sub-skill **`render-video:ffmpeg-compose`**.

**Audio pipeline (CRITICAL — avoid corruption):**
- All scene clips MUST be encoded with uniform audio settings: `-c:a aac -b:a 192k -ar 44100 -ac 2`
- Silent clips (cover, transitions) MUST include a silent audio track: `-f lavfi -i anullsrc=r=44100:cl=stereo`
- Use **concat demuxer** (`-f concat -safe 0`) with **re-encoded uniform clips**, NOT mpegts protocol concat (which corrupts audio)
- Mix BGM AFTER concatenation, not during

**BGM selection:**
- Music MUST match the story's mood. A bedtime story needs cozy/gentle music (music box, soft piano, lofi lullaby), NOT EDM or upbeat tracks.
- Search Tunetank, Pixabay, or Uppbeat for royalty-free tracks matching the story mood.
- Verify downloaded audio is valid (file size > 10KB, plays correctly).

## Error Handling

- If a step fails for a specific scene, log the error and continue.
- Report summary at end: succeeded / failed / needs action.
- All generated files are cached. Re-running only processes missing files.

## Cost Reporting

| Item | Cost |
|---|---|
| DALL-E 3 HD (1792x1024) | ~$0.08 per image |
| TTS (OpenAI tts-1-hd) | ~$0.01 per 1000 chars |
| TTS (ElevenLabs) | ~$0.30 per 1000 chars |
| Page-turn transitions | free (Playwright + FFmpeg) |
| Ken Burns + compose | free (FFmpeg) |
