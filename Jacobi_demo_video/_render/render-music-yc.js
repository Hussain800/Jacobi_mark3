// YC-style thematic music for the JACOBI demo.
//
// Differences vs v1 (which mirrored the moody A-dorian engine in film/audio.js):
//   - Key: C major (uplifting / optimistic) instead of A-dorian
//   - Tempo: 115 BPM (was 100)  — moves the demo forward
//   - Chord loop: C – G – Am – F  (I–V–vi–IV — the YC/anthem progression)
//   - Lead: bright pluck (fast decay) + bell harmonics every 4th bar
//   - Drums: snappy four-on-the-floor kick + closed-hat 8ths + clap on 2&4
//   - Build: arrangement scales with intensity envelope tied to film acts
//
// Same chunked OfflineAudioContext rendering as v1 (10 × 30 s) — single-shot
// hangs Chromium when scheduling > ~20k synth events.

const path = require('path');
const fs = require('fs');
const http = require('http');
const handler = require('serve-handler');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'music.wav');
const DURATION = 300;
const CHUNK = 30;
const SR = 44100;
const PORT = 8767;

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
const SR = ${SR};

function renderChunk(startT, dur) {
  return new Promise(async (resolve, reject) => {
    try {
      const ctx = new OfflineAudioContext(2, Math.round(SR * dur), SR);

      // Bus structure: master -> highshelf -> destination
      //                drumBus, melBus, padBus -> master
      const master = ctx.createGain(); master.gain.value = 0.75;
      const hi = ctx.createBiquadFilter(); hi.type='highshelf'; hi.frequency.value=5000; hi.gain.value=3;
      master.connect(hi).connect(ctx.destination);

      const drumBus = ctx.createGain(); drumBus.gain.value = 0.95; drumBus.connect(master);
      const melBus  = ctx.createGain(); melBus.gain.value  = 0.85; melBus.connect(master);
      const padBus  = ctx.createGain(); padBus.gain.value  = 0.70; padBus.connect(master);

      const inWin = (t) => t >= 0 && t <= ctx.length / SR;

      // --- primitives -------------------------------------------------------
      function tone(opts) {
        const { freq, when, dur, type='sine', gain=0.1, attack=0.005, release=0.05,
                filter=8000, detune=0, bus=melBus } = opts;
        if (!inWin(when)) return;
        const osc = ctx.createOscillator(); osc.type=type; osc.frequency.value=freq; osc.detune.value=detune;
        const filt = ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=filter; filt.Q.value=0.8;
        const g = ctx.createGain(); g.gain.value=0;
        osc.connect(filt).connect(g).connect(bus);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+attack);
        g.gain.exponentialRampToValueAtTime(0.0001, when+dur);
        osc.start(when); osc.stop(when+dur+release);
      }

      // Bright "pluck" — fast attack, fast exponential decay, slight detune for life
      function pluck(when, freq, gain=0.18, decay=0.35, bus=melBus) {
        if (!inWin(when)) return;
        const osc = ctx.createOscillator(); osc.type='triangle'; osc.frequency.value=freq;
        const osc2 = ctx.createOscillator(); osc2.type='sawtooth'; osc2.frequency.value=freq; osc2.detune.value=6;
        const filt = ctx.createBiquadFilter(); filt.type='lowpass';
        filt.frequency.setValueAtTime(4500, when);
        filt.frequency.exponentialRampToValueAtTime(1200, when+decay);
        filt.Q.value=1.2;
        const g = ctx.createGain(); g.gain.value=0;
        osc.connect(filt); osc2.connect(filt); filt.connect(g).connect(bus);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, when+decay);
        osc.start(when); osc.stop(when+decay+0.05);
        osc2.start(when); osc2.stop(when+decay+0.05);
      }

      // Bell — sine + 3rd + 5th harmonic, very fast attack, long tail
      function bell(when, freq, gain=0.06) {
        if (!inWin(when)) return;
        const ratios = [1, 2.01, 3.02];
        const gains = [gain, gain*0.5, gain*0.25];
        for (let i = 0; i < ratios.length; i++) {
          const osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value=freq*ratios[i];
          const g = ctx.createGain(); g.gain.value=0;
          osc.connect(g).connect(melBus);
          g.gain.setValueAtTime(0, when);
          g.gain.linearRampToValueAtTime(gains[i], when+0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, when+1.6);
          osc.start(when); osc.stop(when+1.7);
        }
      }

      // Pad — slow-attack triangle stack on padBus
      function pad(when, dur, chord, gain=0.04) {
        chord.forEach((f, i) => {
          tone({ freq:f, when, dur, type:'triangle', gain, attack:0.6, release:0.6,
                  filter:1400, detune:i*5, bus:padBus });
          tone({ freq:f*2, when, dur, type:'sine', gain:gain*0.3, attack:0.6, release:0.6,
                  filter:2400, detune:-i*5, bus:padBus });
        });
      }

      // Sub-bass — pure sine, root only, longer notes
      function sub(when, dur, freq, gain=0.16) {
        if (!inWin(when)) return;
        const osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value=freq;
        const g = ctx.createGain(); g.gain.value=0;
        osc.connect(g).connect(master);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+0.02);
        g.gain.setValueAtTime(gain, when+dur-0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, when+dur);
        osc.start(when); osc.stop(when+dur+0.05);
      }

      function kick(when, gain=0.6) {
        if (!inWin(when)) return;
        const osc = ctx.createOscillator(); osc.type='sine';
        const g = ctx.createGain(); g.gain.value=0;
        osc.connect(g).connect(drumBus);
        osc.frequency.setValueAtTime(160, when);
        osc.frequency.exponentialRampToValueAtTime(45, when+0.07);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+0.003);
        g.gain.exponentialRampToValueAtTime(0.001, when+0.32);
        osc.start(when); osc.stop(when+0.4);
        // Click for snap
        const click = ctx.createBufferSource();
        const cb = ctx.createBuffer(1, ctx.sampleRate*0.005, ctx.sampleRate);
        const cd = cb.getChannelData(0);
        for (let i=0;i<cd.length;i++) cd[i] = Math.random()*2-1;
        click.buffer = cb;
        const cg = ctx.createGain(); cg.gain.value=0;
        click.connect(cg).connect(drumBus);
        cg.gain.setValueAtTime(0, when);
        cg.gain.linearRampToValueAtTime(gain*0.25, when+0.001);
        cg.gain.exponentialRampToValueAtTime(0.0001, when+0.01);
        click.start(when); click.stop(when+0.02);
      }

      function clap(when, gain=0.2) {
        if (!inWin(when)) return;
        // Three quick noise bursts to simulate a clap
        for (let i = 0; i < 3; i++) {
          const t = when + i*0.011;
          const n = ctx.createBufferSource();
          const buf = ctx.createBuffer(1, ctx.sampleRate*0.05, ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let j=0;j<d.length;j++) d[j] = Math.random()*2-1;
          n.buffer = buf;
          const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1500;
          const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2400; bp.Q.value=0.9;
          const g = ctx.createGain(); g.gain.value=0;
          n.connect(hp).connect(bp).connect(g).connect(drumBus);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(gain * (i===2?1.2:0.7), t+0.002);
          g.gain.exponentialRampToValueAtTime(0.001, t+0.18);
          n.start(t); n.stop(t+0.22);
        }
      }

      function hat(when, gain=0.05, open=false) {
        if (!inWin(when)) return;
        const n = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate*(open?0.18:0.04), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
        n.buffer = buf;
        const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=8000;
        const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=11000; bp.Q.value=1.6;
        const g = ctx.createGain(); g.gain.value=0;
        n.connect(hp).connect(bp).connect(g).connect(drumBus);
        const dur = open ? 0.18 : 0.04;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+0.001);
        g.gain.exponentialRampToValueAtTime(0.001, when+dur);
        n.start(when); n.stop(when+dur+0.05);
      }

      function riser(when, dur, gain=0.06) {
        if (!inWin(when)) return;
        const n = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate*dur), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
        n.buffer = buf;
        const hp = ctx.createBiquadFilter(); hp.type='highpass';
        hp.frequency.setValueAtTime(800, when);
        hp.frequency.exponentialRampToValueAtTime(6000, when+dur);
        const g = ctx.createGain(); g.gain.value=0;
        n.connect(hp).connect(g).connect(master);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+dur*0.85);
        g.gain.exponentialRampToValueAtTime(0.001, when+dur);
        n.start(when); n.stop(when+dur+0.05);
      }

      function impact(when, gain=0.5) {
        if (!inWin(when)) return;
        // Low boom
        const osc = ctx.createOscillator(); osc.type='sine';
        osc.frequency.setValueAtTime(120, when);
        osc.frequency.exponentialRampToValueAtTime(40, when+0.5);
        const g = ctx.createGain(); g.gain.value=0;
        osc.connect(g).connect(master);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, when+1.8);
        osc.start(when); osc.stop(when+2);
        // Hi shimmer
        const n = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate*0.5, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
        n.buffer = buf;
        const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=5000;
        const ng = ctx.createGain(); ng.gain.value=0;
        n.connect(hp).connect(ng).connect(master);
        ng.gain.setValueAtTime(0, when);
        ng.gain.linearRampToValueAtTime(gain*0.4, when+0.01);
        ng.gain.exponentialRampToValueAtTime(0.001, when+0.6);
        n.start(when); n.stop(when+0.7);
      }

      // --- musical grid ----------------------------------------------------
      // Frequencies (C major octave)
      const F = {
        C2:65.41, E2:82.41, G2:98.00, A2:110.00,
        C3:130.81, D3:146.83, E3:164.81, F3:174.61, G3:196.00, A3:220.00, B3:246.94,
        C4:261.63, D4:293.66, E4:329.63, F4:349.23, G4:392.00, A4:440.00, B4:493.88,
        C5:523.25, D5:587.33, E5:659.25, F5:698.46, G5:783.99, A5:880.00, B5:987.77,
        C6:1046.50, D6:1174.66, E6:1318.51, G6:1568.00,
      };

      // I-V-vi-IV chord progression in C major (the YC anthem progression)
      const PROG = [
        { root: F.C2, sub: F.C3, chord: [F.C4, F.E4, F.G4],   arp: [F.C4, F.E4, F.G4, F.C5, F.E5, F.G5, F.E5, F.C5] },
        { root: F.G2, sub: F.G3, chord: [F.G3, F.B3, F.D4],   arp: [F.G3, F.B3, F.D4, F.G4, F.B4, F.D5, F.B4, F.G4] },
        { root: F.A2, sub: F.A3, chord: [F.A3, F.C4, F.E4],   arp: [F.A3, F.C4, F.E4, F.A4, F.C5, F.E5, F.C5, F.A4] },
        { root: F.F3, sub: F.F3, chord: [F.F3, F.A3, F.C4],   arp: [F.F3, F.A3, F.C4, F.F4, F.A4, F.C5, F.A4, F.F4] },
      ];

      // Anthem melody — phrased so each chord has its own 4-note motif
      const MELODY = [
        [F.E5, F.G5, F.E5, F.C5],     // over C
        [F.D5, F.G5, F.D5, F.B4],     // over G
        [F.C5, F.E5, F.C5, F.A4],     // over Am
        [F.A4, F.C5, F.A4, F.F4],     // over F
      ];

      const BPM = 115;
      const BEAT = 60 / BPM;
      const BAR = BEAT * 4;

      // --- arrangement envelopes (per film time, not per bar) --------------
      // Maps film t -> {pad, sub, drums, hat, lead, bell, pluck}
      function arr(t) {
        // Act mapping aligned to BEATS in the original film:
        //   0..7       cold open  (silence, breath)
        //   7..35      tension build (sub pluck, no drums)
        //   35..80     brand reveal + walkthrough start (full mid kit)
        //   80..130    architecture (anthemic — drums + lead + bell)
        //   130..188   live product (slightly pulled back, focus on VO)
        //   188..248   verdict + evidence (re-builds, energy returns)
        //   248..290   share + export + buyer grid (full anthem)
        //   290..296   collapse (sparser)
        //   296..300   lock (low pad fade)
        if (t < 6)   return { pad:0.0,  sub:0.0,  drums:0.0, hat:0.0, lead:0.0, bell:0.0, pluck:0.0 };
        if (t < 14)  return { pad:0.4,  sub:0.0,  drums:0.0, hat:0.0, lead:0.0, bell:0.0, pluck:0.2 };
        if (t < 28)  return { pad:0.55, sub:0.3,  drums:0.0, hat:0.0, lead:0.0, bell:0.0, pluck:0.45 };
        if (t < 35)  return { pad:0.65, sub:0.45, drums:0.0, hat:0.4, lead:0.0, bell:0.0, pluck:0.55 };
        if (t < 42)  return { pad:0.7,  sub:0.55, drums:0.5, hat:0.7, lead:0.0, bell:0.4, pluck:0.6 };
        if (t < 80)  return { pad:0.65, sub:0.6,  drums:0.7, hat:0.8, lead:0.45, bell:0.5, pluck:0.7 };
        if (t < 130) return { pad:0.7,  sub:0.7,  drums:0.9, hat:0.9, lead:0.85, bell:0.7, pluck:0.85 };
        if (t < 188) return { pad:0.5,  sub:0.55, drums:0.55, hat:0.7, lead:0.4,  bell:0.4, pluck:0.55 };
        if (t < 248) return { pad:0.65, sub:0.7,  drums:0.85, hat:0.85, lead:0.75, bell:0.6, pluck:0.8 };
        if (t < 290) return { pad:0.75, sub:0.75, drums:0.95, hat:0.9, lead:0.9, bell:0.85, pluck:0.9 };
        if (t < 296) return { pad:0.5,  sub:0.3,  drums:0.3, hat:0.3, lead:0.2, bell:0.3, pluck:0.3 };
        return { pad:0.4, sub:0.0, drums:0.0, hat:0.0, lead:0.0, bell:0.2, pluck:0.0 };
      }

      // --- write the chunk -------------------------------------------------
      const firstBar = Math.max(0, Math.floor(startT / BAR));
      const lastBar  = Math.floor((startT + dur) / BAR);
      for (let b = firstBar; b <= lastBar + 1; b++) {
        const barT = b * BAR;
        const localT = barT - startT;
        if (localT > dur + 0.2) continue;
        const idx = b % 4;
        const chord = PROG[idx];
        const a = arr(barT);

        // Pad — held the whole bar
        if (a.pad > 0.05) {
          pad(localT, BAR + 0.2, chord.chord, 0.05 * a.pad);
        }

        // Sub bass — root, half-bar notes for warmth
        if (a.sub > 0.05) {
          sub(localT, BAR/2, chord.sub, 0.18 * a.sub);
          sub(localT + BAR/2, BAR/2, chord.sub, 0.16 * a.sub);
        }

        // Drums — 4-on-the-floor kick + clap on 2&4 + hats on 8ths
        if (a.drums > 0.05) {
          for (let beat = 0; beat < 4; beat++) {
            const t = localT + beat*BEAT;
            kick(t, 0.55 * a.drums);
            if (beat === 1 || beat === 3) clap(t, 0.18 * a.drums);
          }
        }
        if (a.hat > 0.05) {
          for (let h = 0; h < 8; h++) {
            const t = localT + h*(BEAT/2);
            hat(t, 0.045 * a.hat * (h%2===0?1:0.7), h===7);
          }
        }

        // Plucky arp — 8 sixteenths through arp scale, very YC-anthem
        if (a.pluck > 0.05) {
          for (let i = 0; i < 8; i++) {
            const t = localT + i*(BEAT/2);
            const f = chord.arp[i % chord.arp.length];
            pluck(t, f, 0.08 * a.pluck, BEAT*0.4);
          }
        }

        // Anthem lead — quarter notes through the melody motif
        if (a.lead > 0.05) {
          const m = MELODY[idx];
          for (let i = 0; i < 4; i++) {
            const t = localT + i*BEAT;
            const f = m[i];
            tone({ freq:f, when:t, dur:BEAT*0.9, type:'sawtooth', gain:0.09*a.lead,
                   attack:0.01, release:0.08, filter:3000, bus:melBus });
            tone({ freq:f/2, when:t, dur:BEAT*0.9, type:'triangle', gain:0.045*a.lead,
                   attack:0.01, release:0.08, filter:1500, bus:melBus });
          }
        }

        // Bell — every 4 bars on the downbeat, plays melody note
        if (a.bell > 0.05 && b % 4 === 0) {
          bell(localT, MELODY[idx][0] * 2, 0.06 * a.bell);
        }
      }

      // Risers + impacts at section boundaries — same beats as original film
      const stingers = [
        [35.0, 'impact', 0.55], [34.2, 'riser',  1.6, 0.08],
        [80.0, 'impact', 0.42], [79.0, 'riser',  1.2, 0.06],
        [130.0,'impact', 0.45], [129.2,'riser',  1.0, 0.05],
        [188.0,'impact', 0.5 ], [187.2,'riser',  1.4, 0.06],
        [248.0,'impact', 0.45], [247.2,'riser',  1.2, 0.06],
        [265.0,'impact', 0.5 ], [264.0,'riser',  1.5, 0.07],
        [290.0,'impact', 0.55], [289.0,'riser',  1.0, 0.06],
        [296.0,'impact', 0.4 ],
      ];
      for (const s of stingers) {
        const localT = s[0] - startT;
        if (localT < -0.1 || localT > dur + 0.5) continue;
        if (s[1] === 'impact') impact(localT, s[2]);
        else riser(localT, s[2], s[3]);
      }

      const buf = await ctx.startRendering();
      const ch0 = buf.getChannelData(0);
      const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
      const int16 = new Int16Array(buf.length * 2);
      for (let i = 0; i < buf.length; i++) {
        let l = ch0[i], r = ch1[i];
        if (l > 1) l = 1; else if (l < -1) l = -1;
        if (r > 1) r = 1; else if (r < -1) r = -1;
        int16[i*2]     = l < 0 ? l * 0x8000 : l * 0x7fff;
        int16[i*2 + 1] = r < 0 ? r * 0x8000 : r * 0x7fff;
      }
      const bytes = new Uint8Array(int16.buffer);
      let bin = '';
      const STEP = 0x8000;
      for (let i = 0; i < bytes.length; i += STEP) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
      }
      resolve(btoa(bin));
    } catch (e) { reject(e); }
  });
}

window.__renderChunk = renderChunk;
window.__ready = true;
</script></body></html>`;

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/m.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(HTML); }
      else handler(req, res, { public: path.resolve(__dirname, '..') });
    });
    server.listen(PORT, () => resolve(server));
  });
}

function wavHeader(numSamples, sr = SR, numCh = 2, bps = 16) {
  const dataLen = numSamples * numCh * (bps/8);
  const byteRate = sr * numCh * (bps/8);
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0); buf.writeUInt32LE(36+dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numCh, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(numCh*(bps/8), 32); buf.writeUInt16LE(bps, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  return buf;
}

(async () => {
  const t0 = Date.now();
  const server = await serve();
  console.log('[boot] server on :' + PORT);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto(`http://localhost:${PORT}/m.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });

  const chunks = [];
  const n = Math.ceil(DURATION / CHUNK);
  for (let i = 0; i < n; i++) {
    const startT = i * CHUNK;
    const d = Math.min(CHUNK, DURATION - startT);
    console.log(`[render] chunk ${i+1}/${n}  t=${startT}..${startT+d}s`);
    const b64 = await page.evaluate(([s, dd]) => window.__renderChunk(s, dd), [startT, d]);
    chunks.push(Buffer.from(b64, 'base64'));
  }

  const pcm = Buffer.concat(chunks);
  const samples = pcm.length / 4;
  fs.writeFileSync(OUT, Buffer.concat([wavHeader(samples), pcm]));
  console.log(`[done] ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB) in ${((Date.now()-t0)/1000).toFixed(0)}s`);

  await browser.close();
  server.close();
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
