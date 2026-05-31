"""
v2 voiceover — much more human, energetic, YC-pitch-style.

Two upgrades over v1:
  1. Voice: en-US-AndrewMultilingualNeural (2024-gen, conversational male).
     The "Multilingual" tier is meaningfully more expressive than the older
     en-US-AriaNeural we used before, with real intonation and breath.
  2. SSML per line: prosody (pitch +3%, rate -2% baseline), <break> for natural
     pacing at commas/periods, <emphasis> on product nouns and numbers, slight
     per-line prosody variation so consecutive lines don't sound identical.

Output: _render/vo.wav (44.1 kHz / 16-bit stereo / 300 s).
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

# Pick a voice with style support if available; fall back to base multilingual.
VOICE = "en-US-AndrewMultilingualNeural"
DURATION = 300
SR = 44100

# Words to emphasize when they appear inside a line — product nouns, numbers,
# concrete claims. Case-insensitive whole-word match.
EMPHASIS = {
    "jacobi", "twenty-four", "24",
    "real money", "evidence", "verdict",
    "spread", "discrimination index", "topology",
    "one hundred and eighty-six", "$186", "144", "71",
    "live", "free", "pro", "enterprise",
    "datacenter", "residential", "mobile",
    "next js", "google", "supabase", "stripe", "fast api",
    "investigation", "act on",
}

LINES = [
    # (timecode, text, per-line prosody overrides)
    (3.2,   "The internet looks universal.",                          dict(rate="-4%", pitch="+1%")),
    (8.5,   "It is not.",                                              dict(rate="-12%", pitch="-2%")),
    (14.5,  "One URL — one product, one flight — can become twenty-four different realities.", dict(rate="-2%")),
    (23.5,  "Depending on who the web thinks you are.",               dict(rate="-3%")),
    (28.5,  "And the gap between those realities, is real money.",   dict(rate="-4%", pitch="+2%")),

    (38.5,  "This. Is Jacobi.",                                       dict(rate="-15%", pitch="+4%")),
    (43.0,  "A forensic web-pricing intelligence platform. Paste a URL, and Jacobi launches twenty-four synthetic shopper identities across location, device, cookie history, and referrer.", dict(rate="-1%")),
    (56.0,  "Compares what each of them sees. The differences, become evidence.", dict(rate="-2%")),
    (66.0,  "Evidence, becomes a report. Built for the analyst who treats pricing as evidence — and needs the paper trail.", dict(rate="-2%")),

    (82.5,  "Under the hood, Jacobi is a full-stack pipeline.",       dict(rate="-3%", pitch="+2%")),
    (90.5,  "Next J S on Vercel. Google sign-in. Supabase for profiles, history, and board opt-ins. Stripe handles subscription upgrade. A Fast A P I back end enforces quotas, then dispatches the engine.", dict(rate="0%")),
    (103.0, "The twenty-four identity engine deploys in three waves. Datacenter. Residential. Mobile.", dict(rate="-3%", pitch="+2%")),
    (115.5, "Each identity reports back. Prices are normalized. Spread is calculated. A topology is classified. A report, is written.", dict(rate="-2%")),
    (126.0, "All of it stored, shareable, and yours.",                dict(rate="-4%", pitch="+3%")),

    (132.5, "This is the live product.",                              dict(rate="-3%", pitch="+4%")),
    (137.0, "The landing tells you the thesis in one sentence. Your browser is a bargaining tool.", dict(rate="-2%")),
    (144.0, "Pricing. Free, to start. Twenty-four probes a month. Pro at twenty-nine dollars. Fifty probes a month. Enterprise on request. Every probe runs the full twenty-four identity engine.", dict(rate="-1%")),
    (159.0, "Sign in, is one click.",                                 dict(rate="-4%")),
    (163.5, "The probe cockpit. Paste a URL. Decide whether this probe is public on the board. Launch.", dict(rate="-2%")),
    (176.5, "Twenty-four identities deploy in waves, across geography and device.", dict(rate="-2%", pitch="+1%")),
    (190.0, "And the verdict. The same flight returned different prices. Spread: a hundred and forty-four dollars. Discrimination index: seventy-one. Topology: progressive.", dict(rate="-2%", pitch="+2%")),
    (206.0, "An iPhone in Manhattan paid a hundred and eighty-six dollars more, than an Android in rural Iowa. Same seat. Same date. The driver was, location.", dict(rate="-3%", pitch="+1%")),
    (218.0, "Every probe is saved under your account.",               dict(rate="-3%")),
    (224.0, "Public probes — opted in by the user, or curated — populate the board. Anyone can read the evidence.", dict(rate="-2%")),
    (236.0, "Every report has a shareable URL. Send it to a journalist. Send it to procurement. Send it to a regulator.", dict(rate="-2%", pitch="+1%")),
    (250.0, "Pro users get the forensic record. P D F for the paper trail. Raw C S V and J S O N for the analyst. Full evidence chain.", dict(rate="-2%")),

    (266.5, "Travel. Ecommerce. Journalism. Consumer protection. Procurement. Market intelligence. Compliance. Competitive teams.", dict(rate="-1%", pitch="+2%")),
    (274.5, "Subscription today. A P I and team workspaces next.",   dict(rate="-3%", pitch="+2%")),

    (285.0, "Jacobi turns hidden web behavior, into evidence. Not screenshots. Not guesses. A repeatable investigation.", dict(rate="-3%", pitch="+2%")),
    (293.0, "One URL. Twenty-four identities. Evidence you can act on.", dict(rate="-8%", pitch="+3%")),
]


def sanitize(s: str) -> str:
    return (s
            .replace("—", ", ")
            .replace("–", ", ")
            .replace("’", "'")
            .replace("‘", "'")
            .replace("“", '"')
            .replace("”", '"'))


def to_ssml(text: str, prosody: dict) -> str:
    """Wrap text in SSML with prosody, emphasis on product nouns, and pauses."""
    text = sanitize(text)

    # Insert short breaks after commas, longer after periods/colons.
    # (Don't double-up if the punctuation is followed by markup.)
    text = re.sub(r",\s+", r',<break time="180ms"/> ', text)
    text = re.sub(r"\.\s+", r'.<break time="350ms"/> ', text)
    text = re.sub(r":\s+", r':<break time="220ms"/> ', text)

    # Emphasis: wrap each emphasis token (word-boundary, case-insensitive).
    for token in sorted(EMPHASIS, key=len, reverse=True):
        # token may contain spaces (multi-word) — match literal with word boundary
        pattern = re.compile(r"(?<![A-Za-z0-9])" + re.escape(token) + r"(?![A-Za-z0-9])", re.IGNORECASE)
        text = pattern.sub(lambda m: f'<emphasis level="moderate">{m.group(0)}</emphasis>', text)

    rate = prosody.get("rate", "-2%")
    pitch = prosody.get("pitch", "+3%")
    volume = prosody.get("volume", "default")

    # NOTE: edge-tts wraps the body in a <speak> for us; we only provide the inner SSML.
    return f'<prosody rate="{rate}" pitch="{pitch}" volume="{volume}">{text}</prosody>'


async def synth_line(ssml: str, dest: Path, retries: int = 3):
    # Pass our SSML via the `text` arg — edge-tts treats angle brackets as SSML markup.
    last = None
    for attempt in range(retries):
        try:
            communicate = edge_tts.Communicate(ssml, voice=VOICE)
            await communicate.save(str(dest))
            if dest.exists() and dest.stat().st_size > 0:
                return
            raise RuntimeError("empty mp3")
        except Exception as e:
            last = e
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"failed after {retries}: {last}")


async def main():
    tmp = Path(tempfile.mkdtemp(prefix="jacobi_vo2_"))
    print(f"[boot] tmp dir: {tmp}")
    print(f"[boot] voice : {VOICE}")
    print(f"[boot] lines : {len(LINES)} (sequential, SSML)")

    for i, (t, text, prosody) in enumerate(LINES):
        mp3 = tmp / f"vo_{i:02d}.mp3"
        ssml = to_ssml(text, prosody)
        try:
            await synth_line(ssml, mp3)
            print(f"  [{i+1:2d}/{len(LINES)}] t={t:6.1f}s  ok  ({mp3.stat().st_size//1024}KB)")
        except Exception as e:
            print(f"  [{i+1:2d}/{len(LINES)}] t={t:6.1f}s  FAIL  {e}")
            print(f"        SSML was: {ssml[:160]}...")
            raise

    print("[mix]  composing 300s timeline -> vo.wav")

    inputs = ["-f", "lavfi", "-t", str(DURATION), "-i", f"anullsrc=r={SR}:cl=stereo"]
    for i in range(len(LINES)):
        inputs.extend(["-i", str(tmp / f"vo_{i:02d}.mp3")])

    fp = []
    mix = ["[0:a]"]
    for i, (t, _, _) in enumerate(LINES):
        delay_ms = int(round(t * 1000))
        fp.append(f"[{i+1}:a]aresample={SR},aformat=channel_layouts=stereo,adelay={delay_ms}|{delay_ms}[d{i}]")
        mix.append(f"[d{i}]")
    n = len(LINES) + 1
    fp.append(f"{''.join(mix)}amix=inputs={n}:duration=first:normalize=0[out]")
    fg = ";".join(fp)

    cmd = [str(FFMPEG), "-y", *inputs, "-filter_complex", fg, "-map", "[out]",
           "-t", str(DURATION), "-c:a", "pcm_s16le", "-ar", str(SR), "-ac", "2", str(OUT)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("[ffmpeg stderr]\n" + r.stderr[-3000:])
        sys.exit(r.returncode)

    print(f"[done] {OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB)")

    for f in tmp.glob("*"):
        f.unlink()
    tmp.rmdir()


if __name__ == "__main__":
    asyncio.run(main())
