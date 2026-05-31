// film/audio.js
// Music + VO for the Jacobi film.
//
// MUSIC — Hand-built indie/electronic score in A dorian.
//   - 100 BPM, kick-driven from 30s onward
//   - Chord progression Am – F – C – G on a 9.6s phrase
//   - Pad + bass + arpeggio + lead build into anthem at business case
//   - Riser + impact at every act change
//
// VO — Three modes, switchable live:
//   - "tts"  (default): best-quality browser voice in sync with timeline,
//             with a voice picker so you can pick the most human option
//             your system offers (Edge neural / macOS enhanced / etc.)
//   - "file": upload your own MP3/WAV (real human VO recording)
//   - "off":  captions only

(function () {
  const M = {
    ctx: null,
    master: null,
    musicBus: null,
    voBus: null,
    started: false,
    nodes: [],
    voBuf: null,
    voSource: null,
    voOffsetSec: 0,
    voPlaying: false,
    voMode: 'tts',     // 'tts' | 'file' | 'off'
    voVoice: null,
    voIndex: -1,
    voUtterance: null,
    voSpeaking: false,
    timeRef: 0,
    scheduledUpTo: 0,
    scheduler: null,
    poll: null,
    musicMode: 'on',
  };

  // ── VO script: timecode + text. Punctuation tuned for natural breath.
  const VO = [
    { t: 3.2,   text: "The internet looks universal." },
    { t: 8.5,   text: "It is not." },
    { t: 14.5,  text: "One URL — one product, one flight — can become twenty-four different realities." },
    { t: 23.5,  text: "Depending on who the web thinks you are." },
    { t: 28.5,  text: "And the gap between those realities, is real money." },
    { t: 38.5,  text: "This. Is Jacobi." },
    { t: 43.0,  text: "A forensic web-pricing intelligence platform. Paste a URL, and Jacobi launches twenty-four synthetic shopper identities across location, device, cookie history, and referrer." },
    { t: 56.0,  text: "Compares what each of them sees. The differences, become evidence." },
    { t: 66.0,  text: "Evidence, becomes a report. Built for the analyst who treats pricing as evidence — and needs the paper trail." },
    { t: 82.5,  text: "Under the hood, Jacobi is a full-stack pipeline." },
    { t: 90.5,  text: "Next J S on Vercel. Google sign-in. Supabase for profiles, history, and board opt-ins. Stripe handles subscription upgrade. A Fast A P I back end enforces quotas, then dispatches the engine." },
    { t: 103.0, text: "The twenty-four identity engine deploys in three waves. Datacenter. Residential. Mobile." },
    { t: 115.5, text: "Each identity reports back. Prices are normalized. Spread is calculated. A topology is classified. A report, is written." },
    { t: 126.0, text: "All of it stored, shareable, and yours." },
    { t: 132.5, text: "This is the live product." },
    { t: 137.0, text: "The landing tells you the thesis in one sentence. Your browser is a bargaining tool." },
    { t: 144.0, text: "Pricing. Free, to start. Twenty-four probes a month. Pro at twenty-nine dollars. Fifty probes a month. Enterprise on request. Every probe runs the full twenty-four identity engine." },
    { t: 159.0, text: "Sign in, is one click." },
    { t: 163.5, text: "The probe cockpit. Paste a URL. Decide whether this probe is public on the board. Launch." },
    { t: 176.5, text: "Twenty-four identities deploy in waves, across geography and device." },
    { t: 190.0, text: "And the verdict. The same flight returned different prices. Spread: a hundred and forty-four dollars. Discrimination index: seventy-one. Topology: progressive." },
    { t: 206.0, text: "An iPhone in Manhattan paid a hundred and eighty-six dollars more, than an Android in rural Iowa. Same seat. Same date. The driver was, location." },
    { t: 218.0, text: "Every probe is saved under your account." },
    { t: 224.0, text: "Public probes — opted in by the user, or curated — populate the board. Anyone can read the evidence." },
    { t: 236.0, text: "Every report has a shareable URL. Send it to a journalist. Send it to procurement. Send it to a regulator." },
    { t: 250.0, text: "Pro users get the forensic record. P D F for the paper trail. Raw C S V and J S O N for the analyst. Full evidence chain." },
    { t: 266.5, text: "Travel. Ecommerce. Journalism. Consumer protection. Procurement. Market intelligence. Compliance. Competitive teams." },
    { t: 274.5, text: "Subscription today. A P I and team workspaces next." },
    { t: 285.0, text: "Jacobi turns hidden web behavior, into evidence. Not screenshots. Not guesses. A repeatable investigation." },
    { t: 293.0, text: "One URL. Twenty-four identities. Evidence you can act on." },
  ];

  // ── TTS voice ranking — pick highest-quality voice available ─────────
  function rankVoice(v) {
    const name = (v.name || '').toLowerCase();
    let score = 0;
    if (/natural|neural/i.test(v.name)) score += 1000;
    if (/premium|enhanced|wavenet|studio/i.test(v.name)) score += 800;
    if (/microsoft/i.test(v.name) && /aria|guy|jenny|davis|tony|sara|nancy|brian|emma|ava|andrew/i.test(v.name)) score += 700;
    if (/google us english/i.test(v.name)) score += 400;
    if (/google uk english/i.test(v.name)) score += 380;
    if (/samantha|daniel|karen|allison|tom|fred|alex|moira|nora/i.test(v.name)) score += 250;
    if (/zira|david|mark|hazel/i.test(v.name)) score += 200;
    if (/^en[-_]/i.test(v.lang)) score += 100;
    if (v.lang === 'en-US') score += 50;
    else if (v.lang === 'en-GB') score += 40;
    if (v.localService) score += 20;
    if (/compact|eloquence|whisper|novelty/i.test(name)) score -= 300;
    return score;
  }

  function listVoices() {
    if (!('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices()
      .filter(v => /^en/i.test(v.lang))
      .slice()
      .sort((a, b) => rankVoice(b) - rankVoice(a));
  }

  function whenVoicesReady(cb, attempts = 40) {
    const tryNow = () => {
      const list = listVoices();
      if (list.length > 0) cb(list);
      else if (attempts > 0) setTimeout(() => whenVoicesReady(cb, attempts - 1), 120);
      else cb([]);
    };
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => cb(listVoices());
    }
    tryNow();
  }

  function speakLine(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (M.voVoice) utt.voice = M.voVoice;
    const name = (M.voVoice && M.voVoice.name || '').toLowerCase();
    const isMasc = /daniel|alex|david|guy|tom|fred|brian|davis|tony|mark|andrew/i.test(name);
    utt.rate = 0.97;
    utt.pitch = isMasc ? 0.92 : 1.0;
    utt.volume = 1.0;
    utt.onstart = () => {
      M.voSpeaking = true;
      if (M.musicBus && M.ctx && M.musicMode === 'on') {
        M.musicBus.gain.linearRampToValueAtTime(0.32, M.ctx.currentTime + 0.15);
      }
    };
    utt.onend = () => {
      M.voSpeaking = false;
      if (M.musicBus && M.ctx && M.musicMode === 'on') {
        M.musicBus.gain.linearRampToValueAtTime(0.85, M.ctx.currentTime + 0.4);
      }
    };
    M.voUtterance = utt;
    window.speechSynthesis.speak(utt);
  }

  function maybeSpeak(filmTime) {
    if (M.voMode !== 'tts') return;
    let target = -1;
    for (let i = 0; i < VO.length; i++) {
      if (filmTime >= VO[i].t && filmTime < VO[i].t + 0.4) target = i;
    }
    if (target >= 0 && target !== M.voIndex) {
      M.voIndex = target;
      speakLine(VO[target].text);
    }
  }

  function stopTTS() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    M.voSpeaking = false;
    if (M.musicBus && M.ctx && M.musicMode === 'on') {
      M.musicBus.gain.linearRampToValueAtTime(0.85, M.ctx.currentTime + 0.3);
    }
  }

  // ── Audio context ──────────────────────────────────────────────────────
  function ctx() {
    if (M.ctx) return M.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    M.ctx = new Ctx();
    M.master = M.ctx.createGain();
    M.master.gain.value = 0.7;
    const hi = M.ctx.createBiquadFilter();
    hi.type = 'highshelf'; hi.frequency.value = 4000; hi.gain.value = 2;
    M.master.connect(hi).connect(M.ctx.destination);
    M.musicBus = M.ctx.createGain();
    M.musicBus.gain.value = 0.85;
    M.musicBus.connect(M.master);
    M.voBus = M.ctx.createGain();
    M.voBus.gain.value = 1.0;
    M.voBus.connect(M.master);
    return M.ctx;
  }

  // ── Synth primitives ───────────────────────────────────────────────────
  function note(opts) {
    const { freq, when, dur, type = 'sine', gain = 0.1, attack = 0.005, release = 0.04, filter = 8000, detune = 0, bus = M.musicBus } = opts;
    const osc = M.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const filt = M.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = filter; filt.Q.value = 1;
    const g = M.ctx.createGain();
    g.gain.value = 0;
    osc.connect(filt).connect(g).connect(bus);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.start(when);
    osc.stop(when + dur + release);
  }
  function kick(when, gain = 0.55) {
    const osc = M.ctx.createOscillator();
    osc.type = 'sine';
    const g = M.ctx.createGain(); g.gain.value = 0;
    osc.connect(g).connect(M.musicBus);
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.08);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.35);
    osc.start(when); osc.stop(when + 0.4);
  }
  function snare(when, gain = 0.18) {
    const bo = M.ctx.createOscillator();
    bo.type = 'triangle'; bo.frequency.value = 180;
    const bg = M.ctx.createGain(); bg.gain.value = 0;
    bo.connect(bg).connect(M.musicBus);
    bg.gain.setValueAtTime(0, when);
    bg.gain.linearRampToValueAtTime(gain * 0.5, when + 0.002);
    bg.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
    bo.start(when); bo.stop(when + 0.12);
    const noise = M.ctx.createBufferSource();
    const bufSize = M.ctx.sampleRate * 0.2;
    const buf = M.ctx.createBuffer(1, bufSize, M.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    const hp = M.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1800;
    const ng = M.ctx.createGain(); ng.gain.value = 0;
    noise.connect(hp).connect(ng).connect(M.musicBus);
    ng.gain.setValueAtTime(0, when);
    ng.gain.linearRampToValueAtTime(gain, when + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    noise.start(when); noise.stop(when + 0.25);
  }
  function hat(when, gain = 0.05, open = false) {
    const noise = M.ctx.createBufferSource();
    const bufSize = M.ctx.sampleRate * 0.05;
    const buf = M.ctx.createBuffer(1, bufSize, M.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    const hp = M.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    const bp = M.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 9500; bp.Q.value = 1.5;
    const g = M.ctx.createGain(); g.gain.value = 0;
    noise.connect(hp).connect(bp).connect(g).connect(M.musicBus);
    const dur = open ? 0.22 : 0.04;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    noise.start(when); noise.stop(when + dur + 0.05);
  }
  function impact(when, freq = 55, dur = 2.4, gain = 0.6) {
    const osc = M.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 2, when);
    osc.frequency.exponentialRampToValueAtTime(freq, when + 0.5);
    const g = M.ctx.createGain(); g.gain.value = 0;
    osc.connect(g).connect(M.master);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.start(when); osc.stop(when + dur);
  }
  function riser(when, dur = 2.0, gain = 0.06) {
    const noise = M.ctx.createBufferSource();
    const bufSize = M.ctx.sampleRate * dur;
    const buf = M.ctx.createBuffer(1, bufSize, M.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    const hp = M.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1200;
    const g = M.ctx.createGain(); g.gain.value = 0;
    noise.connect(hp).connect(g).connect(M.musicBus);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    noise.start(when); noise.stop(when + dur + 0.1);
  }

  // ── Score ──────────────────────────────────────────────────────────────
  const N = {
    A2: 110.0, C3: 130.8, E3: 164.8, F3: 174.6, G3: 196.0,
    A3: 220.0, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392.0,
    A4: 440.0, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784.0,
    A5: 880.0, C6: 1046.5,
  };
  const PROG = [
    { root: 'A2', chord: ['A2','C4','E4'],      arpScale: ['A3','C4','E4','G4','A4','E4'] },
    { root: 'F3', chord: ['F3','A3','C4','F4'], arpScale: ['F3','A3','C4','F4','A4','C4'] },
    { root: 'C3', chord: ['C3','E3','G3','C4'], arpScale: ['C4','E4','G4','C5','E5','G4'] },
    { root: 'G3', chord: ['G3','B4','D4','G4'], arpScale: ['G4','B4','D5','G5','D5','B4'] },
  ];
  const BPM = 100, BEAT = 60 / BPM, BAR = BEAT * 4, PHRASE = BAR * 4;

  function padChord(when, chord, gainMul = 0.04) {
    chord.forEach((n, i) => {
      note({ freq: N[n], when, dur: BAR + 0.2, type: 'triangle',
        gain: gainMul, attack: 0.5, release: 0.4, filter: 1100, detune: i * 6 });
    });
  }
  function bassBar(when, rootName, gain = 0.16) {
    const f = N[rootName];
    for (let b = 0; b < 4; b++) {
      note({ freq: f, when: when + b * BEAT, dur: BEAT * 0.95, type: 'triangle',
        gain, attack: 0.005, release: 0.05, filter: 1200 });
    }
  }
  function drumBar(when, intensity = 0.7) {
    for (let b = 0; b < 4; b++) {
      const t = when + b * BEAT;
      if (intensity > 0.05) kick(t, 0.5 * Math.min(1, intensity * 1.2));
      if ((b === 1 || b === 3) && intensity > 0.3) snare(t, 0.18 * Math.min(1, intensity));
      if (intensity > 0.4) hat(t + BEAT * 0.5, 0.04 * intensity);
      if (intensity > 0.6) {
        hat(t + BEAT * 0.25, 0.025 * intensity);
        hat(t + BEAT * 0.75, 0.025 * intensity);
      }
    }
  }
  function arpBar(when, scale, gain = 0.05) {
    for (let i = 0; i < 8; i++) {
      const t = when + i * (BEAT / 2);
      const n = scale[i % scale.length];
      note({ freq: N[n], when: t, dur: BEAT * 0.4, type: 'triangle',
        gain, attack: 0.002, release: 0.06, filter: 4500 });
      if (i % 4 === 0) {
        note({ freq: N[n] * 2, when: t, dur: BEAT * 0.3, type: 'sine',
          gain: gain * 0.4, attack: 0.002, release: 0.04, filter: 6000 });
      }
    }
  }
  function leadPhrase(when, chordIdx, gain = 0.07) {
    const melodies = [
      ['A4','C5','E5','D5'], ['F4','A4','C5','A4'],
      ['G4','C5','E5','G5'], ['G4','B4','D5','G5'],
    ];
    const m = melodies[chordIdx % 4];
    for (let i = 0; i < 4; i++) {
      const t = when + i * BEAT;
      note({ freq: N[m[i]], when: t, dur: BEAT * 0.9, type: 'sawtooth',
        gain, attack: 0.01, release: 0.05, filter: 2200 });
      note({ freq: N[m[i]] / 2, when: t, dur: BEAT * 0.9, type: 'triangle',
        gain: gain * 0.4, attack: 0.01, release: 0.05, filter: 1200 });
    }
  }

  function intensityAt(t) {
    if (t < 8) return 0.0;
    if (t < 23) return 0.15;
    if (t < 35) return 0.25;
    if (t < 42) return 0.55;
    if (t < 80) return 0.7;
    if (t < 130) return 0.85;
    if (t < 188) return 0.6;
    if (t < 205) return 0.85;
    if (t < 248) return 0.55;
    if (t < 265) return 0.55;
    if (t < 290) return 0.95;
    if (t < 296) return 0.5;
    return 0.3;
  }
  function drumsAt(t) {
    if (t < 35) return 0.0;
    if (t < 42) return 0.5;
    if (t < 80) return 0.7;
    if (t < 130) return 1.0;
    if (t < 188) return 0.7;
    if (t < 205) return 1.0;
    if (t < 248) return 0.55;
    if (t < 265) return 0.55;
    if (t < 290) return 1.0;
    if (t < 296) return 0.4;
    return 0.2;
  }
  function leadAt(t) {
    if (t < 80) return 0.0;
    if (t < 130) return 0.0;
    if (t < 188) return 0.3;
    if (t < 205) return 0.7;
    if (t < 248) return 0.3;
    if (t < 265) return 0.2;
    if (t < 290) return 1.0;
    return 0.0;
  }
  function arpAt(t) {
    if (t < 80) return 0.0;
    if (t < 130) return 0.9;
    if (t < 188) return 0.5;
    if (t < 205) return 0.7;
    if (t < 248) return 0.5;
    if (t < 265) return 0.4;
    if (t < 290) return 0.8;
    return 0.0;
  }

  function schedulePeriod(start, end) {
    const offset = (t) => M.timeRef + t;
    const firstBar = Math.floor(start / BAR);
    const lastBar  = Math.floor(end / BAR);
    for (let b = firstBar; b <= lastBar; b++) {
      const barTime = b * BAR;
      if (barTime < start - BAR || barTime >= end) continue;
      if (barTime < 0) continue;
      const chordIdx = b % 4;
      const chord = PROG[chordIdx];
      const inten = intensityAt(barTime);
      const dr = drumsAt(barTime);
      const ar = arpAt(barTime);
      const ld = leadAt(barTime);
      if (inten > 0.05) padChord(offset(barTime), chord.chord, 0.025 * inten);
      if (inten > 0.2) bassBar(offset(barTime), chord.root, 0.12 * inten);
      if (dr > 0.05) drumBar(offset(barTime), dr);
      if (ar > 0.05) arpBar(offset(barTime), chord.arpScale, 0.04 * ar);
      if (ld > 0.1) leadPhrase(offset(barTime), chordIdx, 0.07 * ld);
    }
    const fire = (t, fn) => { if (t >= start && t < end) fn(offset(t)); };
    fire(34.2, (at) => riser(at, 1.6, 0.08));
    fire(35.0, (at) => { impact(at, 55, 2.8, 0.65); impact(at, 110, 1.8, 0.25); });
    fire(79.0, (at) => riser(at, 1.2, 0.06));
    fire(80.0, (at) => impact(at, 73, 2.2, 0.35));
    fire(102.0, (at) => impact(at, 73, 1.4, 0.25));
    fire(129.2, (at) => riser(at, 1.0, 0.05));
    fire(130.0, (at) => impact(at, 55, 1.8, 0.30));
    fire(187.2, (at) => riser(at, 1.4, 0.06));
    fire(188.0, (at) => impact(at, 73, 2.2, 0.40));
    fire(264.0, (at) => riser(at, 1.6, 0.08));
    fire(265.0, (at) => impact(at, 55, 2.4, 0.50));
    fire(290.0, (at) => impact(at, 55, 2.6, 0.45));
    fire(296.0, (at) => impact(at, 41, 3.5, 0.4));
  }

  function startMusic(filmTime) {
    if (M.started) return;
    ctx();
    M.ctx.resume();
    M.timeRef = M.ctx.currentTime - filmTime;
    M.started = true;
    schedulePeriod(filmTime, filmTime + 4);
    M.scheduledUpTo = filmTime + 4;
    M.scheduler = setInterval(() => {
      if (!M.ctx) return;
      const filmNow = M.ctx.currentTime - M.timeRef;
      const lookahead = 4;
      if (M.scheduledUpTo < filmNow + lookahead) {
        schedulePeriod(M.scheduledUpTo, filmNow + lookahead);
        M.scheduledUpTo = filmNow + lookahead;
      }
    }, 1000);
  }
  function reanchor(filmTime) {
    if (!M.ctx) return;
    M.timeRef = M.ctx.currentTime - filmTime;
    M.scheduledUpTo = filmTime;
  }

  // ── File VO ────────────────────────────────────────────────────────────
  function loadVOFile(file) {
    return new Promise((resolve, reject) => {
      ctx();
      const reader = new FileReader();
      reader.onload = (e) => {
        M.ctx.decodeAudioData(e.target.result)
          .then((buf) => { M.voBuf = buf; resolve(buf); })
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
  function startFileVO(filmTime) {
    if (!M.voBuf || M.voMode !== 'file') return;
    stopFileVO();
    const off = Math.max(0, filmTime + M.voOffsetSec);
    if (off >= M.voBuf.duration) return;
    M.voSource = M.ctx.createBufferSource();
    M.voSource.buffer = M.voBuf;
    M.voSource.connect(M.voBus);
    M.voSource.start(0, off);
    M.voPlaying = true;
    if (M.musicBus && M.ctx) M.musicBus.gain.linearRampToValueAtTime(0.35, M.ctx.currentTime + 0.15);
  }
  function stopFileVO() {
    if (M.voSource) { try { M.voSource.stop(); } catch {} M.voSource.disconnect(); }
    M.voSource = null;
    M.voPlaying = false;
  }

  // ── Sync poll ──────────────────────────────────────────────────────────
  function startPoll(getTime, getPlaying) {
    if (M.poll) clearInterval(M.poll);
    M.poll = setInterval(() => {
      const t = getTime();
      const p = getPlaying();

      if (!p) {
        if (M.musicBus && M.ctx) M.musicBus.gain.linearRampToValueAtTime(0, M.ctx.currentTime + 0.15);
        if (M.voSource) { try { M.voSource.stop(); } catch {} M.voSource = null; M.voPlaying = false; }
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
          try { window.speechSynthesis.pause(); } catch {}
        }
        return;
      } else {
        if (M.musicBus && M.ctx && M.musicMode === 'on') {
          const ducked = (M.voPlaying || M.voSpeaking);
          M.musicBus.gain.linearRampToValueAtTime(ducked ? 0.32 : 0.85, M.ctx.currentTime + 0.2);
        }
        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
          try { window.speechSynthesis.resume(); } catch {}
        }
      }

      if (!M.ctx) return;
      const expected = M.ctx.currentTime - M.timeRef;
      if (Math.abs(expected - t) > 0.5) {
        reanchor(t);
        M.voIndex = -1;
        stopTTS();
        stopFileVO();
        if (M.voMode === 'file' && M.voBuf) startFileVO(t);
      } else {
        if (M.voMode === 'tts') maybeSpeak(t);
        if (M.voMode === 'file' && M.voBuf && !M.voPlaying) startFileVO(t);
      }
    }, 120);
  }

  // ── Public API ─────────────────────────────────────────────────────────
  window.JacobiAudio = {
    init({ getTime, getPlaying, onVoiceReady }) {
      whenVoicesReady((voices) => {
        if (voices.length > 0) {
          M.voVoice = voices[0];
          if (onVoiceReady) onVoiceReady(voices, M.voVoice);
        } else if (onVoiceReady) {
          onVoiceReady([], null);
        }
      });
      const start = () => {
        if (!M.started) {
          const t = getTime();
          startMusic(t);
        } else if (M.ctx && M.ctx.state !== 'running') {
          M.ctx.resume();
        }
      };
      document.addEventListener('pointerdown', start);
      document.addEventListener('keydown', start);
      startPoll(getTime, getPlaying);
    },
    setMusic(on) {
      M.musicMode = on ? 'on' : 'off';
      if (M.musicBus && M.ctx) {
        M.musicBus.gain.linearRampToValueAtTime(on ? 0.85 : 0, M.ctx.currentTime + 0.25);
      }
    },
    setVOMode(mode) {
      if (mode === M.voMode) return;
      stopTTS();
      stopFileVO();
      M.voIndex = -1;
      M.voMode = mode;
    },
    getVOMode() { return M.voMode; },
    loadVO(file) { return loadVOFile(file); },
    hasVOFile() { return !!M.voBuf; },
    listVoices() { return listVoices(); },
    setVoice(name) {
      const v = listVoices().find(x => x.name === name);
      if (v) M.voVoice = v;
      stopTTS();
      M.voIndex = -1;
    },
    getCurrentVoiceName() { return M.voVoice ? M.voVoice.name : null; },
    setVOOffset(sec) { M.voOffsetSec = sec; },
    isSpeaking() { return M.voSpeaking || M.voPlaying; },
  };
})();
