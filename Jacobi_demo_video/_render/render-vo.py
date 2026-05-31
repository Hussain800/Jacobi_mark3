"""
Synthesize the JACOBI film voiceover using Microsoft Edge neural TTS (Aria),
then assemble all 30 lines onto a 300 s stereo WAV timeline at their original
timecodes (matches VO array in film/audio.js).

Output: _render/vo.wav  (44.1 kHz, 16-bit stereo, 300 s, silent except for VO)
"""

import asyncio
import io
import os
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

# Force UTF-8 stdout on Windows (default cp1252 chokes on unicode)
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import edge_tts

HERE = Path(__file__).parent
OUT = HERE / "vo.wav"
FFMPEG = HERE / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"
VOICE = "en-US-AriaNeural"           # warm female neural voice
RATE = "-3%"                         # slightly relaxed pace
DURATION = 300
SR = 44100

# Timecode + text — verbatim from film/audio.js VO[]
LINES = [
    (3.2,   "The internet looks universal."),
    (8.5,   "It is not."),
    (14.5,  "One URL — one product, one flight — can become twenty-four different realities."),
    (23.5,  "Depending on who the web thinks you are."),
    (28.5,  "And the gap between those realities, is real money."),
    (38.5,  "This. Is Jacobi."),
    (43.0,  "A forensic web-pricing intelligence platform. Paste a URL, and Jacobi launches twenty-four synthetic shopper identities across location, device, cookie history, and referrer."),
    (56.0,  "Compares what each of them sees. The differences, become evidence."),
    (66.0,  "Evidence, becomes a report. Built for the analyst who treats pricing as evidence — and needs the paper trail."),
    (82.5,  "Under the hood, Jacobi is a full-stack pipeline."),
    (90.5,  "Next J S on Vercel. Google sign-in. Supabase for profiles, history, and board opt-ins. Stripe handles subscription upgrade. A Fast A P I back end enforces quotas, then dispatches the engine."),
    (103.0, "The twenty-four identity engine deploys in three waves. Datacenter. Residential. Mobile."),
    (115.5, "Each identity reports back. Prices are normalized. Spread is calculated. A topology is classified. A report, is written."),
    (126.0, "All of it stored, shareable, and yours."),
    (132.5, "This is the live product."),
    (137.0, "The landing tells you the thesis in one sentence. Your browser is a bargaining tool."),
    (144.0, "Pricing. Free, to start. Twenty-four probes a month. Pro at twenty-nine dollars. Fifty probes a month. Enterprise on request. Every probe runs the full twenty-four identity engine."),
    (159.0, "Sign in, is one click."),
    (163.5, "The probe cockpit. Paste a URL. Decide whether this probe is public on the board. Launch."),
    (176.5, "Twenty-four identities deploy in waves, across geography and device."),
    (190.0, "And the verdict. The same flight returned different prices. Spread: a hundred and forty-four dollars. Discrimination index: seventy-one. Topology: progressive."),
    (206.0, "An iPhone in Manhattan paid a hundred and eighty-six dollars more, than an Android in rural Iowa. Same seat. Same date. The driver was, location."),
    (218.0, "Every probe is saved under your account."),
    (224.0, "Public probes — opted in by the user, or curated — populate the board. Anyone can read the evidence."),
    (236.0, "Every report has a shareable URL. Send it to a journalist. Send it to procurement. Send it to a regulator."),
    (250.0, "Pro users get the forensic record. P D F for the paper trail. Raw C S V and J S O N for the analyst. Full evidence chain."),
    (266.5, "Travel. Ecommerce. Journalism. Consumer protection. Procurement. Market intelligence. Compliance. Competitive teams."),
    (274.5, "Subscription today. A P I and team workspaces next."),
    (285.0, "Jacobi turns hidden web behavior, into evidence. Not screenshots. Not guesses. A repeatable investigation."),
    (293.0, "One URL. Twenty-four identities. Evidence you can act on."),
]


def sanitize(s: str) -> str:
    # Edge-TTS occasionally returns no audio when text contains em/en dashes or
    # certain unicode quotes — fold them to plain ASCII punctuation.
    return (
        s.replace("—", ", ")   # em dash -> comma
         .replace("–", ", ")   # en dash
         .replace("’", "'")    # right single quote
         .replace("‘", "'")    # left single quote
         .replace("“", '"')    # left double quote
         .replace("”", '"')    # right double quote
    )


async def synth_line(text: str, dest: Path, retries: int = 3):
    """Write one Edge-TTS mp3 to dest, with retries."""
    clean = sanitize(text)
    last_err = None
    for attempt in range(retries):
        try:
            communicate = edge_tts.Communicate(clean, voice=VOICE, rate=RATE)
            await communicate.save(str(dest))
            if dest.exists() and dest.stat().st_size > 0:
                return
            raise RuntimeError("empty mp3")
        except Exception as e:
            last_err = e
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"failed after {retries} retries: {last_err}")


async def main():
    tmp = Path(tempfile.mkdtemp(prefix="jacobi_vo_"))
    print(f"[boot] tmp dir: {tmp}")
    print(f"[boot] synthesizing {len(LINES)} lines via {VOICE} (sequential)")

    # Sequential to avoid edge-tts rate limits
    for i, (t, text) in enumerate(LINES):
        mp3 = tmp / f"vo_{i:02d}.mp3"
        try:
            await synth_line(text, mp3)
            print(f"  [{i+1:2d}/{len(LINES)}] t={t:6.1f}s  ok  ({mp3.stat().st_size//1024}KB)")
        except Exception as e:
            print(f"  [{i+1:2d}/{len(LINES)}] t={t:6.1f}s  FAIL  {e}")
            raise
    print(f"[tts]  OK - {len(LINES)} mp3 segments")

    # Build a single 300 s timeline by overlaying each segment at its timecode
    # using ffmpeg's `adelay` + `amix` filters.
    # Filter graph: for each line, [i+1:a] adelay=<ms>|<ms>[d<i>]; then amix all d<i>.
    inputs = []
    for i in range(len(LINES)):
        mp3 = tmp / f"vo_{i:02d}.mp3"
        inputs.extend(["-i", str(mp3)])

    # silent base track ensures the output is exactly DURATION seconds
    inputs = ["-f", "lavfi", "-t", str(DURATION), "-i", f"anullsrc=r={SR}:cl=stereo"] + inputs

    filter_parts = []
    mix_inputs = ["[0:a]"]
    for i, (t, _) in enumerate(LINES):
        delay_ms = int(round(t * 1000))
        # Input index is i+1 (because index 0 is the silent anullsrc)
        filter_parts.append(
            f"[{i+1}:a]aresample={SR},aformat=channel_layouts=stereo,"
            f"adelay={delay_ms}|{delay_ms}[d{i}]"
        )
        mix_inputs.append(f"[d{i}]")

    n = len(LINES) + 1
    filter_parts.append(
        f"{''.join(mix_inputs)}amix=inputs={n}:duration=first:normalize=0[out]"
    )
    fg = ";".join(filter_parts)

    cmd = [
        str(FFMPEG), "-y",
        *inputs,
        "-filter_complex", fg,
        "-map", "[out]",
        "-t", str(DURATION),
        "-c:a", "pcm_s16le",
        "-ar", str(SR),
        "-ac", "2",
        str(OUT),
    ]
    print(f"[mix]  composing timeline -> {OUT.name}")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("[ffmpeg stderr]\n" + r.stderr[-3000:])
        sys.exit(r.returncode)

    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f"[done] {OUT} ({size_mb:.2f} MB)")

    # Cleanup tmp
    for f in tmp.glob("*"):
        f.unlink()
    tmp.rmdir()


if __name__ == "__main__":
    asyncio.run(main())
