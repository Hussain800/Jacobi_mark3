// v3 video renderer for JACOBI Submission Film.
// Uses Chromium's NEW headless mode with real GPU access so the film actually
// paints at ~30 fps (old headless + swiftshader was capped at ~5 fps).

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const handler = require('serve-handler');
const { chromium } = require('playwright');
const ffmpegPath = require('ffmpeg-static');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(__dirname, 'JACOBI_film_video.mp4');

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION = 300;
const PORT = 8766;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handler(req, res, { public: ROOT }));
    server.listen(PORT, () => resolve(server));
  });
}

function startFfmpeg() {
  return spawn(ffmpegPath, [
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
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
}

(async () => {
  const t0 = Date.now();
  console.log('[boot] server →', ROOT, 'on :' + PORT);
  const server = await startServer();

  console.log('[boot] launching chromium (new headless, GPU enabled)');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--headless=new',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,UseSkiaRenderer',
      '--use-angle=d3d11',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  const url = `http://localhost:${PORT}/Jacobi%20Submission%20Film.html`;
  console.log('[boot] →', url);
  await page.goto(url, { waitUntil: 'load' });

  await page.waitForFunction(
    () => typeof window.__filmSeek === 'function' && typeof window.__filmPause === 'function',
    null,
    { timeout: 30000 },
  );

  await page.evaluate(() => {
    document.querySelectorAll('.first-click-hint, .audio-ctl').forEach((n) => n.remove());
    window.__filmPause();
    window.__filmSeek(0);
  });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(800);

  const session = await context.newCDPSession(page);
  await session.send('Page.enable');

  const frames = [];
  session.on('Page.screencastFrame', async (p) => {
    frames.push({ ts: p.metadata.timestamp, buf: Buffer.from(p.data, 'base64') });
    try { await session.send('Page.screencastFrameAck', { sessionId: p.sessionId }); } catch (_) {}
  });

  console.log('[render] starting screencast');
  await session.send('Page.startScreencast', {
    format: 'jpeg', quality: 92, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1,
  });
  await page.evaluate(() => { window.__filmSeek(0); window.__filmPlay(); });

  const targetEnd = Date.now() + (DURATION + 1) * 1000;
  let lastLog = Date.now();
  await new Promise((resolve) => {
    const tick = setInterval(() => {
      if (Date.now() - lastLog > 5000) {
        const last = frames.length ? (frames[frames.length - 1].ts - frames[0].ts) : 0;
        const fps = frames.length / Math.max(0.001, last);
        console.log(`[render] ${frames.length} frames · last t=${last.toFixed(1)}s · avg=${fps.toFixed(1)}fps · remaining=${((targetEnd - Date.now()) / 1000).toFixed(0)}s`);
        lastLog = Date.now();
      }
      if (Date.now() >= targetEnd) { clearInterval(tick); resolve(); }
    }, 250);
  });

  await session.send('Page.stopScreencast');
  await page.evaluate(() => window.__filmPause());

  if (frames.length === 0) throw new Error('no frames captured');

  const base = frames[0].ts;
  frames.forEach((f) => { f.t = f.ts - base; });
  frames.sort((a, b) => a.t - b.t);
  const captureFps = frames.length / frames[frames.length - 1].t;
  console.log(`[encode] ${frames.length} frames over ${frames[frames.length - 1].t.toFixed(1)}s (avg ${captureFps.toFixed(1)} fps) → ${FPS} fps grid`);

  const ff = startFfmpeg();
  const writeFrame = (buf) => new Promise((resolve, reject) => {
    const ok = ff.stdin.write(buf, (err) => err ? reject(err) : resolve());
    if (!ok) ff.stdin.once('drain', resolve);
  });

  let cursor = 0;
  for (let i = 0; i < DURATION * FPS; i++) {
    const targetT = i / FPS;
    while (cursor + 1 < frames.length &&
           Math.abs(frames[cursor + 1].t - targetT) <= Math.abs(frames[cursor].t - targetT)) {
      cursor++;
    }
    await writeFrame(frames[cursor].buf);
  }

  ff.stdin.end();
  await new Promise((resolve) => ff.on('close', resolve));

  await browser.close();
  server.close();

  const size = fs.statSync(OUT_FILE).size / (1024 * 1024);
  console.log(`[done] ${OUT_FILE}  (${size.toFixed(1)} MB)  in ${((Date.now() - t0) / 1000).toFixed(0)}s  · capture avg ${captureFps.toFixed(1)} fps`);
})().catch((err) => { console.error('[fatal]', err); process.exit(1); });
