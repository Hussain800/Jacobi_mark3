"""
v3 voiceover — plain text only, no inline SSML.

Root cause of v2 bug: edge_tts.Communicate(text, voice=...) does NOT parse inline
SSML by default. Passing <prosody rate="-2%" ...><emphasis ...>word</emphasis></prosody>
caused the engine to literally read the markup aloud, ballooning each line's duration
far beyond the planned timecode, which produced overlapping voices via amix.

v3 fix:
  - Plain text passed to Communicate()
  - Rate / pitch controlled via Communicate constructor kwargs (rate="-3%", pitch="+3Hz")
  - Per-line rate adjustments allowed for lines that run long (up to 3 retries at +5%)
  - Duration probed via ffmpeg -i file.mp3 -f null - (no ffprobe.exe in static package)
  - Timing validation: warn if end_i > cue_{i+1} - 0.15s; re-render faster if needed
  - Summary table printed at end

Output: _render/vo.wav (44.1 kHz / 16-bit stereo / 300 s)
"""

import asyncio
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

import edge_tts

HERE = Path(__file__).parent
OUT = HERE / "vo.wav"
FFMPEG = HERE / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"

VOICE = "en-US-AndrewMultilingualNeural"
DURATION = 300
SR = 44100

BASE_RATE = "-3%"
BASE_PITCH = "+3Hz"

# (timecode_seconds, text) — plain text only, no prosody dicts
LINES = [
    (3.2,   "The internet looks universal."),
    (8.5,   "It is not."),
    (14.5,  "One URL, one product, one flight, can become twenty-four different realities."),
    (23.5,  "Depending on who the web thinks you are."),
    (28.5,  "And the gap between those realities, is real money."),

    (38.5,  "This. Is Jacobi."),
    (43.0,  "A forensic web-pricing intelligence platform. Paste a URL, and Jacobi launches twenty-four synthetic shopper identities across location, device, cookie history, and referrer."),
    (56.0,  "Compares what each of them sees. The differences, become evidence."),
    (66.0,  "Evidence, becomes a report. Built for the analyst who treats pricing as evidence, and needs the paper trail."),

    (82.5,  "Under the hood, Jacobi is a full-stack pipeline."),
    (90.5,  "Next J S on Vercel. Google sign-in. Supabase for storage. Stripe for upgrades. A Fast A P I back end orchestrates the engine."),
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
    (224.0, "Public probes, opted in by the user, or curated, populate the board. Anyone can read the evidence."),
    (236.0, "Every report has a shareable URL. Send it to a journalist. Send it to procurement. Send it to a regulator."),
    (250.0, "Pro users get the forensic record. P D F for the paper trail. Raw C S V and J S O N for the analyst. Full evidence chain."),

    (266.5, "Travel. Ecommerce. Journalism. Procurement. Market intelligence. Compliance."),
    (274.5, "Subscription today. A P I and team workspaces next."),

    (285.0, "Jacobi turns hidden web behavior, into evidence. Not screenshots. Not guesses. A repeatable investigation."),
    (293.0, "One URL. Twenty-four identities. Evidence you can act on."),
]


def sanitize(s: str) -> str:
    """Replace dashes and curly quotes with plain equivalents."""
    return (s
            .replace("—", ", ")
            .replace("–", ", ")
            .replace("‘", "'")
            .replace("’", "'")
            .replace("“", '"')
            .replace("”", '"'))


def rate_add(base: str, pct: int) -> str:
    """Add pct percentage points to a rate string like '-3%' -> '-3% + 5% = +2%'."""
    num = int(re.match(r"([+-]?\d+)", base).group(1))
    result = num + pct
    return f"{result:+d}%"


async def synth_line(text: str, dest: Path, rate: str, pitch: str, retries: int = 3):
    last = None
    for attempt in range(retries):
        try:
            communicate = edge_tts.Communicate(
                text, voice=VOICE, rate=rate, pitch=pitch
            )
            await communicate.save(str(dest))
            if dest.exists() and dest.stat().st_size > 0:
                return
            raise RuntimeError("empty mp3 output")
        except Exception as e:
            last = e
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"failed after {retries} attempts: {last}")


def probe_duration(mp3: Path) -> float:
    """Return duration in seconds by parsing ffmpeg stderr."""
    cmd = [str(FFMPEG), "-i", str(mp3), "-f", "null", "-"]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    # Duration: HH:MM:SS.ss
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", r.stderr)
    if not m:
        raise RuntimeError(f"Could not parse duration from ffmpeg output for {mp3}\nstderr: {r.stderr[:500]}")
    h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
    return h * 3600 + mn * 60 + s


async def render_with_timing_check(tmp: Path) -> list[dict]:
    """Synthesize all lines, probe durations, re-render if too long."""
    results = []
    cues = [t for t, _ in LINES]

    for i, (cue, text) in enumerate(LINES):
        plain = sanitize(text)
        mp3 = tmp / f"vo_{i:02d}.mp3"
        next_cue = cues[i + 1] if i + 1 < len(LINES) else float(DURATION)

        current_rate = BASE_RATE
        dur = None

        for attempt in range(3):
            await synth_line(plain, mp3, rate=current_rate, pitch=BASE_PITCH)
            dur = probe_duration(mp3)
            end = cue + dur
            gap = next_cue - end

            if end <= next_cue - 0.15:
                break
            # Too long — speed up by 5 pp and retry
            print(f"  [WARN] line {i:02d} end={end:.2f}s next_cue={next_cue:.2f}s gap={gap:.2f}s "
                  f"(attempt {attempt+1}) — re-rendering faster")
            current_rate = rate_add(current_rate, 5)

        end = cue + dur
        gap = next_cue - end
        status = "OK" if gap >= 0.15 else "WARN"

        results.append({
            "i": i,
            "cue": cue,
            "dur": dur,
            "end": end,
            "gap": gap,
            "status": status,
            "rate": current_rate,
        })

        print(f"  [{i:02d}] cue={cue:6.1f}s  dur={dur:.2f}s  end={end:.2f}s  "
              f"gap={gap:.2f}s  rate={current_rate}  {status}")

    return results


def build_wav(tmp: Path) -> None:
    """Compose 30 mp3 clips into a 300s stereo wav with adelay+amix."""
    print("[mix]  composing 300s timeline -> vo.wav")

    inputs = ["-f", "lavfi", "-t", str(DURATION), "-i", f"anullsrc=r={SR}:cl=stereo"]
    for i in range(len(LINES)):
        inputs.extend(["-i", str(tmp / f"vo_{i:02d}.mp3")])

    fp = []
    mix = ["[0:a]"]
    for i, (t, _) in enumerate(LINES):
        delay_ms = int(round(t * 1000))
        fp.append(
            f"[{i+1}:a]aresample={SR},aformat=channel_layouts=stereo,"
            f"adelay={delay_ms}|{delay_ms}[d{i}]"
        )
        mix.append(f"[d{i}]")

    n = len(LINES) + 1
    fp.append(f"{''.join(mix)}amix=inputs={n}:duration=first:normalize=0[out]")
    fg = ";".join(fp)

    cmd = [
        str(FFMPEG), "-y", *inputs,
        "-filter_complex", fg,
        "-map", "[out]",
        "-t", str(DURATION),
        "-c:a", "pcm_s16le",
        "-ar", str(SR),
        "-ac", "2",
        str(OUT),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print("[ffmpeg stderr]\n" + r.stderr[-3000:])
        sys.exit(r.returncode)


def print_summary(results: list[dict]) -> None:
    print("\n[summary] Per-line timing report")
    print(f"{'i':>3}  {'cue':>7}  {'dur':>6}  {'end':>7}  {'gap':>7}  status")
    print("-" * 50)
    warns = 0
    longest = max(results, key=lambda r: r["dur"])
    for r in results:
        status = r["status"]
        if status == "WARN":
            warns += 1
        print(f"  {r['i']:02d}  {r['cue']:6.1f}s  {r['dur']:5.2f}s  {r['end']:6.2f}s  "
              f"{r['gap']:6.2f}s  {status}")
    print("-" * 50)
    print(f"Longest spoken line: [{longest['i']:02d}] \"{LINES[longest['i']][1][:60]}...\"  "
          f"dur={longest['dur']:.2f}s")
    print(f"Timing result: {len(results) - warns}/{len(results)} lines fit cleanly, "
          f"{warns} overlap warning(s)")


async def main():
    tmp = Path(tempfile.mkdtemp(prefix="jacobi_vo3_"))
    print(f"[boot] tmp dir : {tmp}")
    print(f"[boot] voice   : {VOICE}")
    print(f"[boot] lines   : {len(LINES)} (plain text, no inline SSML)")
    print(f"[boot] base    : rate={BASE_RATE}  pitch={BASE_PITCH}")

    results = await render_with_timing_check(tmp)

    build_wav(tmp)

    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f"[done] {OUT} ({size_mb:.2f} MB)")

    print_summary(results)

    for f in tmp.glob("*"):
        f.unlink()
    tmp.rmdir()


if __name__ == "__main__":
    asyncio.run(main())
