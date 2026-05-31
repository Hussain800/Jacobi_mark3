// Final mux for the YC-style cut.
//
//   video : JACOBI_film_video.mp4 (smooth 1080p30 master)
//   vo    : vo.wav  (Andrew Multilingual Neural + SSML)
//   music : music.wav (C major 115 BPM I-V-vi-IV YC anthem)
//
// Audio chain:
//   VO  -> normalise to -3dB, gentle compressor (smooth out level)
//   MUSIC -> -10dB, then sidechain-ducked by VO (drops further when VO speaks)
//   amix VO + ducked music -> -1dB limiter -> AAC 192k

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const HERE = __dirname;
const VIDEO = path.join(HERE, 'JACOBI_film_video.mp4');
const VO    = path.join(HERE, 'vo.wav');
const MUSIC = path.join(HERE, 'music.wav');
const OUT   = path.join(HERE, 'JACOBI_film_yc.mp4');

for (const [name, p] of [['video', VIDEO], ['vo', VO], ['music', MUSIC]]) {
  if (!fs.existsSync(p)) { console.error('missing', name, p); process.exit(1); }
  console.log(`[mux] ${name.padEnd(5)} : ${p} (${(fs.statSync(p).size / 1024 / 1024).toFixed(1)} MB)`);
}

const fg = [
  // VO: convert to stereo 44.1k, level up, mild compression
  '[1:a]aresample=44100,aformat=channel_layouts=stereo,' +
    'acompressor=threshold=-22dB:ratio=2.5:attack=10:release=120:makeup=2,' +
    'volume=1.5,asplit=2[voA][voB]',
  // Music: convert, level down, gentle highpass to leave room for VO body
  '[2:a]aresample=44100,aformat=channel_layouts=stereo,' +
    'highpass=f=60,volume=0.45[mus]',
  // Duck music whenever VO is present
  '[mus][voA]sidechaincompress=threshold=0.04:ratio=10:attack=15:release=400:makeup=1[ducked]',
  // Mix VO + ducked music
  '[ducked][voB]amix=inputs=2:duration=longest:normalize=0[mix]',
  // Output limiter to keep peaks safe
  '[mix]alimiter=limit=0.95[aout]',
].join(';');

const args = [
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
const r = spawnSync(ffmpegPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
if (r.status !== 0) { console.error('[mux] ffmpeg failed'); process.exit(r.status || 1); }

const sz = fs.statSync(OUT).size / 1024 / 1024;
console.log(`\n[done] ${OUT} (${sz.toFixed(1)} MB)`);
