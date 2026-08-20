---
name: generate-creative-script
description: Generate dev log filming scripts from git history with Dani-style humor, chunked into video-ready segments with changelogs, bug callouts, comedy hooks, and narration scripts.
---

# /generate-creative-script - Dev Log Script Generator

Generate creative, high-energy dev log filming scripts by analyzing the project's git history. Outputs video-ready asset folders with changelogs, bug comedy, hooks, and narration scripts in the style of YouTubers like Dani.

## Execution Steps

### Step 1: History Scanning

Gather the full git history with stats and diffs:

```bash
git log --stat --all --pretty=format:"%H|%s|%ad|%an" --date=short
```

For detailed diffs of recent work:

```bash
git log --stat -p --all --pretty=format:"--- COMMIT %H ---\nDate: %ad\nAuthor: %an\nMessage: %s\n" --date=short
```

Read and understand:
- What features were added in each commit
- What bugs were fixed
- What architectural changes happened
- The chronological development narrative

### Step 2: Commit Chunking (Logical Grouping)

Group consecutive commits into **Groups** following these rules:

1. **Target size**: Each group should contain enough content for ~3 minutes of video narration
2. **Large commits**: If a single commit involves a massive architectural change or is extremely large, it becomes its own group
3. **Thematic coherence**: Keep related changes together (e.g., "adding physics" stays in one group even if it's 5 small commits)
4. **Chronological order**: Number groups sequentially (Group 1, Group 2, Group 3...)

### Step 3: Global Analysis (MUST complete before file generation)

Before generating ANY files, complete the full cross-group analysis:

- Map which bugs exist in each group (detected by fixes in later groups)
- Identify the comedy potential of each bug
- Plan the narrative arc across all groups
- Note any "famous last words" moments (e.g., "this architecture will definitely scale")

This is critical because BUGS.md requires look-ahead knowledge from future groups.

### Step 4: Asset Generation

Create the `.creative-mode/` directory at the project root. For each group, generate the following:

#### 4.1 Directory Structure

```
.creative-mode/
  {N}-{short-topic-name}/
    CHANGELOG.md
    BUGS.md
    HOOKS.md
    SCRIPT.md
```

Example: `.creative-mode/1-physics-prototype/`

#### 4.2 CHANGELOG.md

Precise, technical changelog of what actually changed in this group's commits:

```markdown
# Changelog - Group {N}: {Topic}

## New Features
- {feature}: {technical description of what was added}

## Changes
- {change}: {what was modified and why}

## Technical Details
- Files changed: {list key files}
- Key mechanisms: {describe the core logic added}
```

#### 4.3 BUGS.md (Look-ahead Analysis)

**Critical**: Look at Group N+1's fixes to identify bugs that exist NOW but aren't fixed yet.

Write in an extremely dramatic, devastated tone:

```markdown
# BUGS - The Hidden Disasters of Group {N}

At this point in development, we were blissfully ignorant. Everything seemed to work.
We were so naive. So innocent. So WRONG.

## Lurking Disasters

### {Bug Title}
**Severity**: {catastrophic/devastating/soul-crushing}
**What we thought**: "{optimistic developer quote}"
**What actually happens**: {dramatic description of the bug}
**Fixed in**: Group {N+1}
**How it manifests**: {visual/behavioral description useful for video B-roll}
```

For the LAST group, write: "As of this recording... we have NO IDEA what bugs are hiding. And honestly? We're terrified."

#### 4.4 HOOKS.md (Comedy Planning)

Design 2-3 comedy hooks per group, combining the bugs and development moments:

```markdown
# Comedy Hooks - Group {N}

## Hook 1: {Hook Title}
**Setup**: {What the viewer sees/hears}
**Punchline**: {The reveal or twist}
**Visual gag**: {How to exaggerate this on screen - e.g., screen recording of the bug, zoom-in on code, meme overlay}

## Hook 2: {Hook Title}
...
```

Think about:
- Visual exaggeration (characters becoming spaghetti, physics explosions, UI elements flying off screen)
- Classic dev comedy (confident "this will work" followed by immediate failure)
- Relatable programmer moments (3 AM commits, Stack Overflow references, "temporary" hacks that become permanent)

#### 4.5 SCRIPT.md (The Dani Generator)

Write a ~1 minute narration script per group.

**Tone & Voice Requirements**:
- Extreme hyperbole and exaggeration
- High-energy, fast-paced delivery rhythm
- Loud complaining about bugs
- Absurd solution metaphors
- Self-deprecating humor about code quality
- Breaking the fourth wall

**Script Structure**:
1. **Opening hook** (5-10 sec): Punchy one-liner that sets up the topic
2. **The Flex** (15-20 sec): Show off what you built, acting like it's the greatest code ever written
3. **The Disaster** (15-20 sec): Bug reveal with maximum dramatic energy
4. **The "Fix"** (10-15 sec): Absurd description of how you solved it (or didn't)
5. **Cliffhanger/Outro** (5-10 sec): Tease next disaster or dramatic collapse

```markdown
# Script - Group {N}: {Topic}

**[OPENING - energetic, looking at camera]**

{Opening line - should grab attention immediately}

**[SHOWING SCREEN - proud developer energy]**

{Narration showing off the feature, acting like it's perfect}

**[BUG REVEAL - dramatic zoom, sound effect cue]**

{The moment everything breaks, maximum drama}

**[THE "FIX" - exhausted but somehow triumphant]**

{Description of the ridiculous solution}

**[OUTRO - either cliffhanger or dramatic collapse]**

{Closing line}

---
**Suggested B-roll**: {list of screen recordings or visual moments to capture}
**Sound effect cues**: {where to add dramatic sounds, meme sounds, etc.}
**Text overlays**: {any on-screen text for emphasis}
```

## Language

- Default output language: **Traditional Chinese (zh-TW)**
- Technical terms and code references remain in English
- Comedy tone should match Mandarin YouTube dev-log style

## Example Output Structure

```
.creative-mode/
  1-initial-setup/
    CHANGELOG.md
    BUGS.md
    HOOKS.md
    SCRIPT.md
  2-physics-system/
    CHANGELOG.md
    BUGS.md
    HOOKS.md
    SCRIPT.md
  3-networking-nightmare/
    CHANGELOG.md
    BUGS.md
    HOOKS.md
    SCRIPT.md
```

## Usage

```
/generate-creative-script              # Analyze full git history
/generate-creative-script --last 20    # Only last 20 commits
/generate-creative-script --from abc123 # From specific commit
```
