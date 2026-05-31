// Render the JACOBI Submission Film (300s, 1920x1080) to mp4.
//
// Strategy: let the film play in real time and use Chrome DevTools
// `Page.startScreencast` to receive frames as Chrome paints them. We store
// raw frames with their CDP metadata timestamps, then after capture resample
// onto a fixed 30 fps grid and pipe to ffmpeg.
//
// Video only — Web Speech TTS voiceover and Web Audio music cannot be captured
// headlessly. For the narrated/scored mix, screen-record the page with audio
// loopback separately.

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const handler = require('serve-handler');
const { chromium } = require('playwright');
const ffmpegPath = require('ffmpeg-static');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(__dirname, 'JACOBI_film_1080p30.mp4');

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION = 300;
const PORT = 8765;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handler(req, res, { public: ROOT }));
    server.listen(PORT, () => resolve(server));
  });
}

function startFfmpeg() {
  const args = [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(FPS),
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'medium',
    '-crf', '18',
    '-movflags', '+faststart',
    OUT_FILE,
  ];
  return spawn(ffmpegPath, args, { stdio: ['pipe', 'inherit', 'inherit'] });
}

(async () => {
  const t0 = Date.now();
  console.log('[boot] serving', ROOT, 'on http://localhost:' + PORT);
  const server = await startServer();

  console.log('[boot] launching chromium');
  const browser = await chromium.launch({
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--use-gl=swiftshader',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.error('[pageerror]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console.error]', msg.text());
  });

  const url = `http://localhost:${PORT}/Jacobi%20Submission%20Film.html`;
  console.log('[boot] navigating', url);
  await page.goto(url, { waitUntil: 'load' });

  console.log('[boot] waiting for film hooks');
  await page.waitForFunction(
    () => typeof window.__filmSeek === 'function' &&
          typeof window.__filmPause === 'function' &&
          typeof window.__filmPlay === 'function',
    null,
    { timeout: 30000 },
  );

  // Pause at t=0, strip overlays the audience shouldn't see in the export.
  await page.evaluate(() => {
    document.querySelectorAll('.first-click-hint, .audio-ctl').forEach((n) => n.remove());
    window.__filmPause();
    window.__filmSeek(0);
  });

  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(800);

  const session = await context.newCDPSession(page);
  await session.send('Page.enable');

  // Collect raw frames; ts is in seconds (CDP screencast metadata.timestamp).
  const frames = [];
  session.on('Page.screencastFrame', async (params) => {
    frames.push({ ts: params.metadata.timestamp, buf: Buffer.from(params.data, 'base64') });
    try {
      await session.send('Page.screencastFrameAck', { sessionId: params.sessionId });
    } catch (_) { /* session closing */ }
  });

  console.log('[render] starting screencast');
  await session.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,
    everyNthFrame: 1,
  });

  // Start playback. Wall-clock duration ≈ DURATION + small tail.
  await page.evaluate(() => {
    window.__filmSeek(0);
    window.__filmPlay();
  });
  console.log('[render] playing for', DURATION, 's');

  const targetEnd = Date.now() + (DURATION + 1) * 1000;
  let lastLog = Date.now();
  await new Promise((resolve) => {
    const tick = setInterval(() => {
      if (Date.now() - lastLog > 5000) {
        const last = frames.length ? (frames[frames.length - 1].ts - frames[0].ts) : 0;
        console.log(`[render] captured ${frames.length} frames · last rel-t=${last.toFixed(2)}s · remaining=${((targetEnd - Date.now()) / 1000).toFixed(0)}s`);
        lastLog = Date.now();
      }
      if (Date.now() >= targetEnd) {
        clearInterval(tick);
        resolve();
      }
    }, 250);
  });

  console.log('[render] stopping screencast');
  await session.send('Page.stopScreencast');
  await page.evaluate(() => window.__filmPause());

  if (frames.length === 0) {
    throw new Error('no screencast frames captured');
  }

  // Resample onto fixed 30 fps grid using metadata timestamps relative to first frame.
  const base = frames[0].ts;
  frames.forEach((f) => { f.t = f.ts - base; });
  frames.sort((a, b) => a.t - b.t);
  console.log(`[encode] resampling ${frames.length} frames (span ${frames[frames.length - 1].t.toFixed(2)}s) to ${FPS} fps`);

  const ff = startFfmpeg();
  const stdin = ff.stdin;
  const writeFrame = (buf) =>
    new Promise((resolve, reject) => {
      const ok = stdin.write(buf, (err) => (err ? reject(err) : resolve()));
      if (!ok) stdin.once('drain', resolve);
    });

  let cursor = 0;
  for (let i = 0; i < DURATION * FPS; i++) {
    const targetT = i / FPS;
    while (
      cursor + 1 < frames.length &&
      Math.abs(frames[cursor + 1].t - targetT) <= Math.abs(frames[cursor].t - targetT)
    ) {
      cursor++;
    }
    await writeFrame(frames[cursor].buf);
  }

  stdin.end();
  await new Promise((resolve) => ff.on('close', resolve));

  await browser.close();
  server.close();

  const size = fs.statSync(OUT_FILE).size / (1024 * 1024);
  console.log(`[done] ${OUT_FILE}  (${size.toFixed(1)} MB)  in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
