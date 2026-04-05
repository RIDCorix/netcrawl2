---
name: render-video:ffmpeg-compose
description: Compose final video from Ken Burns scene clips, page-turn transitions, BGM, and subtitles using FFmpeg. Sub-skill of render-video.
---

# render-video:ffmpeg-compose — FFmpeg Video Assembly

Assemble all generated assets into the final video using FFmpeg.

## Audio Corruption Prevention (CRITICAL)

**The #1 cause of broken audio is mismatched formats during concatenation.**

### Rules:
1. **Every clip MUST have audio** — even silent ones (cover, transitions). Use: `-f lavfi -i anullsrc=r=44100:cl=stereo`
2. **Every clip MUST use identical audio encoding:** `-c:a aac -b:a 192k -ar 44100 -ac 2`
3. **Use concat demuxer** (`-f concat -safe 0 -i concat.txt -c copy`) — NOT the concat protocol (`concat:a.ts|b.ts`) which corrupts audio
4. **Re-encode all clips to uniform format** before concatenation — even if they look identical
5. **Mix BGM AFTER concatenation** — adding BGM during concat creates sync issues

### What went wrong before:
- Using mpegts protocol concat (`-f mpegts` → `concat:a.ts|b.ts`) produced audio with crackling/noise
- Cover clips without audio tracks caused concat to produce corrupted mixed audio
- Solution: re-encode every clip with explicit `-c:a aac -b:a 192k -ar 44100 -ac 2`, then use concat demuxer

## Pipeline

### Step 1: Ken Burns Scene Clips

For each scene, create `output/temp/kb-{scene-id}.mp4` with Ken Burns zoom/pan:

```bash
# Scene with image + audio
ffmpeg -y -loop 1 -i "{image}" -i "{audio}" \
  -t {duration} -r 24 \
  -filter_complex "[0:v]scale=8000:-1,zoompan={kb_expr}:d={frames}:s=1920x1080:fps=24[v]" \
  -map "[v]" -map 1:a \
  -c:v libx264 -c:a aac -b:a 192k -ar 44100 -ac 2 \
  -pix_fmt yuv420p -shortest "{output}"

# Cover / silent clip (MUST include silent audio)
ffmpeg -y -loop 1 -i "{image}" \
  -f lavfi -i anullsrc=r=44100:cl=stereo \
  -t {duration} -r 24 \
  -vf "scale=8000:-1,zoompan={kb_expr}:d={frames}:s=1920x1080:fps=24" \
  -c:v libx264 -c:a aac -b:a 192k -ar 44100 -ac 2 \
  -pix_fmt yuv420p -shortest "{output}"
```

Ken Burns patterns (cycle through for variety):
```
zoom-in-center:  z='1.0+0.12*on/F':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'
zoom+pan-right:  z='1.05+0.12*on/F':x='iw/2-(iw/zoom/2)-50+100*on/F':y='ih/2-(ih/zoom/2)'
zoom+pan-left:   z='1.05+0.12*on/F':x='iw/2-(iw/zoom/2)+50-100*on/F':y='ih/2-(ih/zoom/2)'
zoom-out-center: z='1.18-0.12*on/F':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'
```
Replace `F` with total frames (`duration * fps`).

### Step 2: Prepare Transition Clips

Page-turn transitions from `output/transitions/` have no audio. Add silent audio:

```bash
ffmpeg -y -i "{transition.mp4}" \
  -f lavfi -i anullsrc=r=44100:cl=stereo \
  -c:v libx264 -c:a aac -b:a 192k -ar 44100 -ac 2 \
  -r 24 -pix_fmt yuv420p -shortest -t 1.2 \
  "{output}"
```

### Step 3: Re-encode All Clips to Uniform Format

Before concat, re-encode EVERY clip (scenes + transitions) to guarantee identical format:

```bash
ffmpeg -y -i "{input}" \
  -c:v libx264 -c:a aac -b:a 192k -ar 44100 -ac 2 \
  -r 24 -pix_fmt yuv420p \
  "{uniform-output.mp4}"
```

### Step 4: Concat Demuxer

Write a concat list file:
```
file '/absolute/path/to/uniform-000.mp4'
file '/absolute/path/to/uniform-001.mp4'
...
```

Concatenate:
```bash
ffmpeg -y -f concat -safe 0 -i concat.txt -c copy raw.mp4
```

**Verify audio is intact:**
```bash
ffprobe -v quiet -select_streams a -show_entries stream=codec_name,sample_rate,channels -of csv=p=0 raw.mp4
# Expected: aac,44100,2
```

### Step 5: Add BGM

```bash
ffmpeg -y -i raw.mp4 -i media/bgm.mp3 \
  -filter_complex "[1:a]aloop=loop=-1:size=2e+09,volume=0.1[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k \
  "{final-output.mp4}"
```

Note: `-c:v copy` here is safe because the video is already h264 from the concat step. Only audio needs re-encoding for the mix.

### Step 6: Subtitles (if FFmpeg has libass)

Check: `ffmpeg -filters 2>/dev/null | grep -w ass`

If available:
```bash
ffmpeg -y -i raw.mp4 -vf "ass='{subtitles.ass}'" -c:v libx264 -c:a copy "{output}"
```

If NOT available (common on macOS homebrew): skip subtitle burn-in. User imports `.ass` or `.srt` into CapCut/Premiere.

## BGM Selection Guidelines

**The music MUST match the story mood.** This was a real bug: a bedtime story got EDM music.

| Story type | BGM style | Search terms |
|---|---|---|
| Bedtime story | Music box, soft piano, lofi lullaby | "music box lullaby", "cozy lofi sleep" |
| Adventure | Orchestral, uplifting | "adventure orchestral" |
| Scary/mystery | Dark ambient, tension | "dark ambient mystery" |
| Educational | Light, cheerful | "cheerful kids background" |

**Free sources:** Tunetank (preview CDN: `d1s1y0ui543e5o.cloudfront.net`), Pixabay, Uppbeat

**Always verify downloaded audio:**
```bash
ls -lh media/bgm.mp3          # Must be > 10KB
ffprobe media/bgm.mp3 2>&1    # Should show valid audio stream
ffplay -nodisp -autoexit -t 5 media/bgm.mp3  # Quick listen test
```
