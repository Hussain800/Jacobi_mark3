// Offline-render the procedural music from film/audio.js to music.wav.
// Chunked: 10 × 30s offline contexts so each only holds a few thousand nodes
// (the single-shot 300s render with ~25k nodes hung in headless Chromium).

const path = require('path');
const fs = require('fs');
const http = require('http');
const handler = require('serve-handler');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'music.wav');
const DURATION = 300;
const CHUNK = 30;          // seconds per chunk
const SR = 44100;
const PORT = 8767;

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
const SR = ${SR};

function renderChunk(startT, dur) {
  return new Promise(async (resolve, reject) => {
    try {
      const ctx = new OfflineAudioContext(2, Math.round(SR * dur), SR);
      const master = ctx.createGain(); master.gain.value = 0.7;
      const hi = ctx.createBiquadFilter(); hi.type='highshelf'; hi.frequency.value=4000; hi.gain.value=2;
      master.connect(hi).connect(ctx.destination);
      const musicBus = ctx.createGain(); musicBus.gain.value=0.85;
      musicBus.connect(master);

      function note(opts) {
        const { freq, when, dur, type='sine', gain=0.1, attack=0.005, release=0.04, filter=8000, detune=0, bus=musicBus } = opts;
        if (when < 0 || when > ctx.length / SR) return;
        const osc = ctx.createOscillator(); osc.type=type; osc.frequency.value=freq; osc.detune.value=detune;
        const filt = ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=filter; filt.Q.value=1;
        const g = ctx.createGain(); g.gain.value=0;
        osc.connect(filt).connect(g).connect(bus);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+attack);
        g.gain.exponentialRampToValueAtTime(0.0001, when+dur);
        osc.start(when); osc.stop(when+dur+release);
      }
      function kick(when, gain=0.55) {
        if (when < 0 || when > ctx.length / SR) return;
        const osc=ctx.createOscillator(); osc.type='sine';
        const g=ctx.createGain(); g.gain.value=0;
        osc.connect(g).connect(musicBus);
        osc.frequency.setValueAtTime(150, when);
        osc.frequency.exponentialRampToValueAtTime(42, when+0.08);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+0.004);
        g.gain.exponentialRampToValueAtTime(0.001, when+0.35);
        osc.start(when); osc.stop(when+0.4);
      }
      function snare(when, gain=0.18) {
        if (when < 0 || when > ctx.length / SR) return;
        const bo=ctx.createOscillator(); bo.type='triangle'; bo.frequency.value=180;
        const bg=ctx.createGain(); bg.gain.value=0;
        bo.connect(bg).connect(musicBus);
        bg.gain.setValueAtTime(0, when);
        bg.gain.linearRampToValueAtTime(gain*0.5, when+0.002);
        bg.gain.exponentialRampToValueAtTime(0.001, when+0.08);
        bo.start(when); bo.stop(when+0.12);
        const noise=ctx.createBufferSource();
        const bufSize=ctx.sampleRate*0.2;
        const buf=ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d=buf.getChannelData(0);
        for (let i=0;i<bufSize;i++) d[i]=Math.random()*2-1;
        noise.buffer=buf;
        const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1800;
        const ng=ctx.createGain(); ng.gain.value=0;
        noise.connect(hp).connect(ng).connect(musicBus);
        ng.gain.setValueAtTime(0, when);
        ng.gain.linearRampToValueAtTime(gain, when+0.003);
        ng.gain.exponentialRampToValueAtTime(0.001, when+0.16);
        noise.start(when); noise.stop(when+0.25);
      }
      function hat(when, gain=0.05, open=false) {
        if (when < 0 || when > ctx.length / SR) return;
        const noise=ctx.createBufferSource();
        const bufSize=ctx.sampleRate*0.05;
        const buf=ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d=buf.getChannelData(0);
        for (let i=0;i<bufSize;i++) d[i]=Math.random()*2-1;
        noise.buffer=buf;
        const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=7000;
        const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=9500; bp.Q.value=1.5;
        const g=ctx.createGain(); g.gain.value=0;
        noise.connect(hp).connect(bp).connect(g).connect(musicBus);
        const d2=open?0.22:0.04;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+0.001);
        g.gain.exponentialRampToValueAtTime(0.001, when+d2);
        noise.start(when); noise.stop(when+d2+0.05);
      }
      function impact(when, freq=55, dur=2.4, gain=0.6) {
        if (when < 0 || when > ctx.length / SR) return;
        const osc=ctx.createOscillator(); osc.type='sine';
        osc.frequency.setValueAtTime(freq*2, when);
        osc.frequency.exponentialRampToValueAtTime(freq, when+0.5);
        const g=ctx.createGain(); g.gain.value=0;
        osc.connect(g).connect(master);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, when+dur);
        osc.start(when); osc.stop(when+dur);
      }
      function riser(when, dur=2.0, gain=0.06) {
        if (when < 0 || when > ctx.length / SR) return;
        const noise=ctx.createBufferSource();
        const bufSize=Math.round(ctx.sampleRate*dur);
        const buf=ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d=buf.getChannelData(0);
        for (let i=0;i<bufSize;i++) d[i]=Math.random()*2-1;
        noise.buffer=buf;
        const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1200;
        const g=ctx.createGain(); g.gain.value=0;
        noise.connect(hp).connect(g).connect(musicBus);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gain, when+dur*0.85);
        g.gain.exponentialRampToValueAtTime(0.001, when+dur);
        noise.start(when); noise.stop(when+dur+0.1);
      }

      const N = { A2:110.0,C3:130.8,E3:164.8,F3:174.6,G3:196.0,A3:220.0,C4:261.6,D4:293.7,E4:329.6,F4:349.2,G4:392.0,A4:440.0,B4:493.9,C5:523.3,D5:587.3,E5:659.3,F5:698.5,G5:784.0,A5:880.0,C6:1046.5 };
      const PROG = [
        { root:'A2', chord:['A2','C4','E4'],      arpScale:['A3','C4','E4','G4','A4','E4'] },
        { root:'F3', chord:['F3','A3','C4','F4'], arpScale:['F3','A3','C4','F4','A4','C4'] },
        { root:'C3', chord:['C3','E3','G3','C4'], arpScale:['C4','E4','G4','C5','E5','G4'] },
        { root:'G3', chord:['G3','B4','D4','G4'], arpScale:['G4','B4','D5','G5','D5','B4'] },
      ];
      const BPM=100, BEAT=60/BPM, BAR=BEAT*4;

      function padChord(when, chord, gainMul=0.04) {
        chord.forEach((n,i)=>note({ freq:N[n], when, dur:BAR+0.2, type:'triangle', gain:gainMul, attack:0.5, release:0.4, filter:1100, detune:i*6 }));
      }
      function bassBar(when, rootName, gain=0.16) {
        const f=N[rootName];
        for (let b=0;b<4;b++) note({ freq:f, when:when+b*BEAT, dur:BEAT*0.95, type:'triangle', gain, attack:0.005, release:0.05, filter:1200 });
      }
      function drumBar(when, intensity=0.7) {
        for (let b=0;b<4;b++) {
          const t = when + b*BEAT;
          if (intensity>0.05) kick(t, 0.5*Math.min(1, intensity*1.2));
          if ((b===1||b===3) && intensity>0.3) snare(t, 0.18*Math.min(1, intensity));
          if (intensity>0.4) hat(t+BEAT*0.5, 0.04*intensity);
          if (intensity>0.6) { hat(t+BEAT*0.25, 0.025*intensity); hat(t+BEAT*0.75, 0.025*intensity); }
        }
      }
      function arpBar(when, scale, gain=0.05) {
        for (let i=0;i<8;i++) {
          const t = when + i*(BEAT/2);
          const n = scale[i % scale.length];
          note({ freq:N[n], when:t, dur:BEAT*0.4, type:'triangle', gain, attack:0.002, release:0.06, filter:4500 });
          if (i%4===0) note({ freq:N[n]*2, when:t, dur:BEAT*0.3, type:'sine', gain:gain*0.4, attack:0.002, release:0.04, filter:6000 });
        }
      }
      function leadPhrase(when, chordIdx, gain=0.07) {
        const melodies = [['A4','C5','E5','D5'],['F4','A4','C5','A4'],['G4','C5','E5','G5'],['G4','B4','D5','G5']];
        const m = melodies[chordIdx % 4];
        for (let i=0;i<4;i++) {
          const t = when + i*BEAT;
          note({ freq:N[m[i]], when:t, dur:BEAT*0.9, type:'sawtooth', gain, attack:0.01, release:0.05, filter:2200 });
          note({ freq:N[m[i]]/2, when:t, dur:BEAT*0.9, type:'triangle', gain:gain*0.4, attack:0.01, release:0.05, filter:1200 });
        }
      }
      function intensityAt(t) {
        if (t<8) return 0.0; if (t<23) return 0.15; if (t<35) return 0.25; if (t<42) return 0.55;
        if (t<80) return 0.7; if (t<130) return 0.85; if (t<188) return 0.6; if (t<205) return 0.85;
        if (t<248) return 0.55; if (t<265) return 0.55; if (t<290) return 0.95; if (t<296) return 0.5;
        return 0.3;
      }
      function drumsAt(t) {
        if (t<35) return 0.0; if (t<42) return 0.5; if (t<80) return 0.7; if (t<130) return 1.0;
        if (t<188) return 0.7; if (t<205) return 1.0; if (t<248) return 0.55; if (t<265) return 0.55;
        if (t<290) return 1.0; if (t<296) return 0.4; return 0.2;
      }
      function leadAt(t) {
        if (t<80) return 0.0; if (t<130) return 0.0; if (t<188) return 0.3; if (t<205) return 0.7;
        if (t<248) return 0.3; if (t<265) return 0.2; if (t<290) return 1.0; return 0.0;
      }
      function arpAt(t) {
        if (t<80) return 0.0; if (t<130) return 0.9; if (t<188) return 0.5; if (t<205) return 0.7;
        if (t<248) return 0.5; if (t<265) return 0.4; if (t<290) return 0.8; return 0.0;
      }

      // Schedule bars overlapping this chunk window [startT, startT+dur)
      const firstBar = Math.max(0, Math.floor(startT / BAR));
      const lastBar = Math.floor((startT + dur) / BAR);
      for (let b = firstBar; b <= lastBar; b++) {
        const barTime = b * BAR;
        const localT = barTime - startT;       // time within this chunk
        if (localT + BAR < 0 || localT > dur) continue;
        const chordIdx = b % 4;
        const chord = PROG[chordIdx];
        const inten = intensityAt(barTime);
        const dr = drumsAt(barTime);
        const ar = arpAt(barTime);
        const ld = leadAt(barTime);
        if (inten > 0.05) padChord(localT, chord.chord, 0.025 * inten);
        if (inten > 0.2) bassBar(localT, chord.root, 0.12 * inten);
        if (dr > 0.05) drumBar(localT, dr);
        if (ar > 0.05) arpBar(localT, chord.arpScale, 0.04 * ar);
        if (ld > 0.1) leadPhrase(localT, chordIdx, 0.07 * ld);
      }
      // Stingers that fall inside this chunk
      const stingers = [
        [34.2, 'r', 1.6, 0.08],   [35.0, 'i', 55, 2.8, 0.65], [35.0, 'i', 110, 1.8, 0.25],
        [79.0, 'r', 1.2, 0.06],   [80.0, 'i', 73, 2.2, 0.35],
        [102.0,'i', 73, 1.4, 0.25],
        [129.2,'r', 1.0, 0.05],   [130.0,'i', 55, 1.8, 0.30],
        [187.2,'r', 1.4, 0.06],   [188.0,'i', 73, 2.2, 0.40],
        [264.0,'r', 1.6, 0.08],   [265.0,'i', 55, 2.4, 0.50],
        [290.0,'i', 55, 2.6, 0.45], [296.0,'i', 41, 3.5, 0.4],
      ];
      for (const s of stingers) {
        const localT = s[0] - startT;
        if (localT < 0 || localT > dur) continue;
        if (s[1] === 'r') riser(localT, s[2], s[3]);
        else impact(localT, s[2], s[3], s[4]);
      }

      const buf = await ctx.startRendering();
      const interleaved = new Float32Array(buf.length * 2);
      const ch0 = buf.getChannelData(0), ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
      for (let i = 0; i < buf.length; i++) {
        interleaved[i * 2]     = ch0[i];
        interleaved[i * 2 + 1] = ch1[i];
      }
      // Convert to Int16
      const int16 = new Int16Array(interleaved.length);
      for (let i = 0; i < interleaved.length; i++) {
        let s = interleaved[i];
        if (s > 1) s = 1; else if (s < -1) s = -1;
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const bytes = new Uint8Array(int16.buffer);
      let bin = '';
      const CHUNKSZ = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNKSZ) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNKSZ));
      }
      resolve(btoa(bin));
    } catch (e) {
      reject(e);
    }
  });
}

window.__renderChunk = renderChunk;
window.__ready = true;
</script></body></html>`;

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/music.html') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(HTML);
      } else {
        handler(req, res, { public: path.resolve(__dirname, '..') });
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

function wavHeader(numSamples, sr = SR, numCh = 2, bps = 16) {
  const dataLen = numSamples * numCh * (bps / 8);
  const byteRate = sr * numCh * (bps / 8);
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(numCh, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(numCh * (bps / 8), 32);
  buf.writeUInt16LE(bps, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
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

  await page.goto(`http://localhost:${PORT}/music.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });

  const chunks = [];
  const nChunks = Math.ceil(DURATION / CHUNK);
  for (let i = 0; i < nChunks; i++) {
    const startT = i * CHUNK;
    const dur = Math.min(CHUNK, DURATION - startT);
    console.log(`[render] chunk ${i + 1}/${nChunks}  t=${startT}..${startT + dur}s`);
    const b64 = await page.evaluate(
      ([s, d]) => window.__renderChunk(s, d),
      [startT, dur],
    );
    const pcm = Buffer.from(b64, 'base64');
    chunks.push(pcm);
    console.log(`            -> ${(pcm.length / 1024).toFixed(0)} KB pcm`);
  }

  const totalPcm = Buffer.concat(chunks);
  const totalSamples = totalPcm.length / 4; // 2 channels × 2 bytes
  const header = wavHeader(totalSamples);
  fs.writeFileSync(OUT, Buffer.concat([header, totalPcm]));
  console.log(`[done] ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  await browser.close();
  server.close();
})().catch((e) => { console.error('[fatal]', e); process.exit(1); });
