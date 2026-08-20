# Project: netcrawl2

## Custom Skills

- `/generate-creative-script` — Generate dev log filming scripts from git history (Dani-style). See [.claude/skills/generate-creative-script/SKILL.md](.claude/skills/generate-creative-script/SKILL.md)
- `/render-video` — Render a scene-based video (bedtime stories, narratives) from a `scenes.json` project. Orchestrates art direction, DALL-E 3 image gen, TTS, page-turn transitions, karaoke subtitles, and FFmpeg compose. See [.claude/skills/render-video/SKILL.md](.claude/skills/render-video/SKILL.md)
  - Sub-skills: `render-video:tts`, `render-video:dalle-image`, `render-video:page-turn`, `render-video:subtitles`, `render-video:ffmpeg-compose`
- `/design-quest-chapter` — Design a complete NetCrawl quest chapter: mainline + side quests, learning curve, rewards, and tutorial guides. See [.claude/skills/design-quest-chapter/SKILL.md](.claude/skills/design-quest-chapter/SKILL.md)
- `/pre-release-check` — Run all pre-release checks: i18n audit, TypeScript builds, SDK version. See [.claude/skills/pre-release-check/SKILL.md](.claude/skills/pre-release-check/SKILL.md)
