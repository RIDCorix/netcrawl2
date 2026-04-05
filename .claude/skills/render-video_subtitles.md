---
name: render-video:subtitles
description: Generate karaoke-style ASS subtitle files with word-by-word highlighting. Sub-skill of render-video.
---

# render-video:subtitles — Karaoke ASS Subtitle Generation

Generate an ASS (Advanced SubStation Alpha) subtitle file with karaoke-style word-by-word highlighting.

## Getting Scene Durations

For each scene with narration, determine the audio duration:

**If TTS audio exists** (preferred — gives accurate timing):
```bash
ffprobe -v quiet -show_entries format=duration -of csv=p=0 "output/audio/{scene-id}.mp3"
```

**If no audio** (fallback — estimate from word count):
- Bedtime stories: 120 WPM
- Normal narration: 150 WPM
- Fast/energetic: 180 WPM
- Formula: `duration = (word_count / WPM) * 60`

## ASS File Structure

Write the complete ASS file to `output/subtitles.ass`:

```ass
[Script Info]
Title: {title from scenes.json}
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,{font},52,&H00FFFFFF,&H00FFFFFF,&H00000000,&HCC000000,0,0,0,0,100,100,1,0,1,{strokeWidth},0,2,80,80,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,{start},{end},Karaoke,,0,0,0,,{karaoke text}
```

## ASS Color Format

Colors are in `&HAABBGGRR` format (NOT RGB!):
- White: `&H00FFFFFF`
- Black: `&H00000000`
- Semi-transparent black: `&HCC000000`
- Transparent: `&HFF000000`

## Karaoke Tags

Each word gets a `\kf` tag that specifies how long (in centiseconds) before the next word highlights:

```
{\kf50}Welcome, {\kf50}little {\kf50}one...
```

`\kf50` = 0.5 seconds (50 centiseconds). Use `\kf` (fill) for smooth highlighting, `\k` for instant highlight.

**Calculate per-word duration:**
```
time_per_word_cs = Math.round((scene_duration / word_count) * 100)
```

## Time Format

ASS time format: `H:MM:SS.CC` (centiseconds, not milliseconds)

Examples:
- `0:00:03.00` = 3 seconds
- `0:01:30.50` = 1 minute 30.5 seconds

## Building the Timeline

```
currentTime = 0

# Add cover scene duration first
if cover scene exists:
    currentTime += cover.duration  (usually 3 seconds)

# For each narration scene:
for scene in narration_scenes:
    start = currentTime
    end = currentTime + scene_duration
    
    words = scene.narration.split(" ")
    time_per_word = scene_duration / len(words)
    karaoke = " ".join(f"{{\\kf{round(time_per_word * 100)}}}{word}" for word in words)
    
    emit: Dialogue: 0,{format(start)},{format(end)},Karaoke,,0,0,0,,{karaoke}
    
    currentTime = end + 0.5  # 0.5s gap between scenes
```

## Subtitle Style Settings from scenes.json

Map these fields from `scenes.json.subtitles`:

| scenes.json | ASS field | Notes |
|---|---|---|
| `font` | Fontname | e.g., "EB Garamond" |
| `strokeWidth` | Outline | e.g., 15 |
| `strokeColor` | OutlineColour | Convert hex to &HAABBGGRR |
| `shadowBlur` | Shadow | ASS shadow is simpler than CSS blur |
| `unspokenOpacity` | PrimaryColour alpha | 0 = transparent until spoken |
| `playheadBg` | BackColour | Background behind current word |

## Hex to ASS Color Conversion

```
#000000 → &H00000000  (black, fully opaque)
rgba(0,0,0,0.5) → &H80000000  (black, 50% transparent)
```

Alpha: `0x00` = opaque, `0xFF` = fully transparent. Opposite of CSS!
