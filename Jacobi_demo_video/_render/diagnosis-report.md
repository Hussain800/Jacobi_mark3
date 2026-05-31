# JACOBI VO Bug Diagnosis — v2 vs v3

## Root Cause (v2 bug)

`render-vo-v2.py` called `edge_tts.Communicate(ssml_string, voice=VOICE)` where
`ssml_string` was a hand-built string like `<prosody rate="-2%" pitch="+3%">Hello
<emphasis level="moderate">world</emphasis></prosody>`. The `edge_tts.Communicate`
constructor takes its first positional argument as **plain text**; it does not parse
inline SSML. The TTS engine therefore read the angle-bracket markup aloud, literally
pronouncing "prosody rate minus 2 percent pitch plus 3 percent hello emphasis level
moderate world slash emphasis slash prosody" — making every line 3-6x longer than
planned, which caused adjacent lines to collide and produce overlapping voices in the
`amix` timeline.

## Probe Evidence

`probe.mp3` (already present in `_render/`): **73 KB, ~6 s** for a 5-word sentence
("Hello world" wrapped in full prosody+emphasis SSML). Plain text rendering of the
same phrase takes ~0.5 s. That 12x inflation confirmed the bug.

## Per-Line Gap Report (v3 render)

28 of 30 lines fit cleanly with ≥ 150 ms gap to the next cue.

Two lines hit negative gap even at +12% rate (3 retries each):

| Line | Cue   | Dur    | End    | Gap    | Status |
|------|-------|--------|--------|--------|--------|
| 10   | 90.5s | 14.02s | 104.52s | -1.52s | WARN  |
| 26   | 266.5s | 8.90s | 275.40s | -0.90s | WARN  |

Line 10 ("Next JS on Vercel. Google sign-in. Supabase…") and line 26 ("Travel.
Ecommerce. Journalism…") are both genuinely too long for their timecode windows.
These overlap with the **next** cue (lines 11 and 27), meaning audio from line 10
bleeds past 103.0 s where line 11 starts. In the `amix` output this produces
volume stacking, not voice interruption, and Andrew's single-voice timeline means
both clips are the same speaker so it sounds like a pace overlap rather than two
people talking. If the timecodes cannot be adjusted, the line text must be shortened.

## What v3 Changed

- Removed all inline SSML (`<prosody>`, `<emphasis>`, `<break>`) from the text.
- Passed plain sanitized text as the `text` argument.
- Moved prosody control to constructor kwargs: `rate="-3%"`, `pitch="+3Hz"`.
- Added per-line duration probing via `ffmpeg -i file.mp3 -f null -` + Duration parse.
- Added overlap detection: if `end_i > cue_{i+1} - 0.15s`, re-renders at rate + 5pp
  (up to 3 retries).
- Longest line: line 10, 14.02 s at -3% rate.
- Output: `_render/vo.wav` — 50.47 MB, 300 s, 44.1 kHz 16-bit stereo.
