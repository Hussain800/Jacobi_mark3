// Final mux for the YC-style cut — fixed VO timing / loudness.
//
//   video : JACOBI_film_video.mp4 (smooth 1080p30 master)
//   vo    : vo.wav  (v3 — refreshed by vo-fixer agent)
//   music : music.wav (C major 115 BPM I-V-vi-IV YC anthem)
//
// Audio chain improvements over mux-yc.js:
//   1. Tighter sidechain ducking  (threshold=0.03, ratio=12, attack=8, release=350)
//   2. VO loudnorm to broadcast standard (I=-16, TP=-1.5, LRA=11)

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const HERE = __dirname;
const VIDEO = path.join(HERE, 'JACOBI_film_video.mp4');
const VO    = path.join(HERE, 'vo.wav');
const MUSIC = path.join(HERE, 'music.wav');
const OUT   = path.join(HERE, 'JACOBI_film_yc_fixed.mp4');

// ── sanity-check inputs ────────────────────────────────────────────────────
for (const [name, p] of [['video', VIDEO], ['vo', VO], ['music', MUSIC]]) {
  if (!fs.existsSync(p)) { console.error('missing', name, p); process.exit(1); }
  console.log(`[mux] ${name.padEnd(5)} : ${p} (${(fs.statSync(p).size / 1024 / 1024).toFixed(1)} MB)`);
}

// ── filtergraph ────────────────────────────────────────────────────────────
const fg = [
  // VO: stereo 44.1k → mild compressor → broadcast loudnorm → split for sidechain
  '[1:a]aresample=44100,aformat=channel_layouts=stereo,' +
    'acompressor=threshold=-22dB:ratio=2.5:attack=10:release=120:makeup=2,' +
    'loudnorm=I=-16:TP=-1.5:LRA=11,' +
    'volume=1.5,asplit=2[voA][voB]',
  // Music: stereo 44.1k, level down, gentle highpass
  '[2:a]aresample=44100,aformat=channel_layouts=stereo,' +
    'highpass=f=60,volume=0.45[mus]',
  // Tighter sidechain duck: threshold=0.03 ratio=12 attack=8 release=350
  '[mus][voA]sidechaincompress=threshold=0.03:ratio=12:attack=8:release=350:makeup=1[ducked]',
  // Mix VO + ducked music
  '[ducked][voB]amix=inputs=2:duration=longest:normalize=0[mix]',
  // Output limiter
  '[mix]alimiter=limit=0.95[aout]',
].join(';');

// ── mux ───────────────────────────────────────────────────────────────────
const muxArgs = [
  '-y',
  '-i', VIDEO,
  '-i', VO,
  '-i', MUSIC,
  '-filter_complex', fg,
  '-map', '0:v',
  '-map', '[aout]',
  '-c:v', 'copy',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-shortest',
  '-movflags', '+faststart',
  OUT,
];

console.log('[mux] running ffmpeg…');
const r = spawnSync(ffmpegPath, muxArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
if (r.status !== 0) { console.error('[mux] ffmpeg failed'); process.exit(r.status || 1); }

const sz = fs.statSync(OUT).size / 1024 / 1024;
console.log(`\n[mux] wrote ${OUT} (${sz.toFixed(1)} MB)`);

// ── verify: duration must be 5:00.00 ± 0.5 s ──────────────────────────────
console.log('\n[verify] probing output…');
const probe = spawnSync(
  ffmpegPath,
  ['-i', OUT, '-f', 'null', '-'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

// ffmpeg writes stream info to stderr
const probeOut = (probe.stdout?.toString() ?? '') + (probe.stderr?.toString() ?? '');
const lines = probeOut.split('\n').filter(l => /Duration|Stream/.test(l));
lines.forEach(l => console.log(l));

const durMatch = probeOut.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
if (!durMatch) {
  console.error('[verify] could not parse Duration from ffmpeg output');
  process.exit(1);
}

const totalSec = parseInt(durMatch[1], 10) * 3600
               + parseInt(durMatch[2], 10) * 60
               + parseFloat(durMatch[3]);

const TARGET = 300; // 5:00
const TOLERANCE = 0.5;
if (Math.abs(totalSec - TARGET) > TOLERANCE) {
  console.error(`[verify] FAIL — duration ${totalSec.toFixed(2)}s is outside ${TARGET} ± ${TOLERANCE}s`);
  process.exit(1);
}

console.log(`[verify] OK — duration ${totalSec.toFixed(2)}s (target ${TARGET}s)`);
console.log('\n[done] JACOBI_film_yc_fixed.mp4 ready.');
