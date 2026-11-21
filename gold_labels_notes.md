# Gold Labels: Notes

**Who wrote these:** Claude (an LLM), reading the screenplay text only. This is a single-labeller, model-written reference set. It is not an editor's judgment, and the doc states this explicitly. The owner should review every window and keep or change it.

**Blind to the tool?** The labeller had not seen the tool's picks for these six episodes (6, 14, 17, 24, 41, 47) before labelling.

**Criteria (from the brief):** 20 to 60 seconds, starts on a line start, ends on a line end, hook in the first 3 seconds, ends unresolved, and makes sense to a viewer who has not seen the show. All windows were checked to start and end on real line boundaries, with no cut inside a dialogue line.

**File format:** `gold_labels.json` maps episode number to a list of `[start_seconds, end_seconds]` windows. An empty list means "would not post a promo from this episode".

## Episode 24
- `[22.5, 48.0]` (25.5 s). Opens on confrontation, includes dramatic peak, and ends on high-tension threat.
- `[6.8, 32.5]` (25.7 s). Opens on interrogation hook, ends unresolved before confrontation. Overlaps the first window.

## Episode 41
- `[58.0, 84.0]` (26.0 s). Opens on dramatic question in custody, ends on climax beat. Needs context.
- `[1.8, 28.4]` (26.6 s). Opens on public proclamation hook, ends unresolved on entrance beat.

## Episode 47
- `[56.8, 101.0]` (44.2 s). Opens on plea for shelter, ends on unexpected twist.
- `[1.8, 30.3]` (28.5 s). Opens on conspiracy beat, ends on title risk question.

## Episodes 6, 14, 17 (no promo)
Quiet romance episodes with no shocking opener and no unresolved dramatic ending. Assigned empty lists `[]` to test whether the tool avoids forcing a pick on low-tension episodes.

## Limits
- Six episodes and one labeller (an LLM) is a small, weak reference.
- Episodes 41 and 47 are in the late part of the series. The tool's series ranking lowers them, so compare against the per-episode top 3, not the series list.
