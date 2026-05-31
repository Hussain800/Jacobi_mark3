// Mux the rendered video + audio into the final JACOBI_film_perfect.mp4.
//
// Inputs (auto-detected, music is optional):
//   - JACOBI_film_video.mp4   ← v3 video render
//   - vo.wav                   ← edge-tts voiceover at correct timecodes
//   - music.wav (optional)     ← OfflineAudioContext score
//
// If music.wav is present, mix VO over music with sidechain ducking (music
// drops to -10 dB whenever VO is present). Otherwise the audio track is
// VO-only.

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const HERE = __dirname;
const VIDEO = path.join(HERE, 'JACOBI_film_video.mp4');
const VO    = path.join(HERE, 'vo.wav');
const MUSIC = path.join(HERE, 'music.wav');
const OUT   = path.join(HERE, 'JACOBI_film_perfect.mp4');

if (!fs.existsSync(VIDEO)) { console.error('missing video:', VIDEO); process.exit(1); }
if (!fs.existsSync(VO))    { console.error('missing VO:', VO); process.exit(1); }
const hasMusic = fs.existsSync(MUSIC);
console.log('[mux] video :', VIDEO, '(' + (fs.statSync(VIDEO).size / 1024 / 1024).toFixed(1) + ' MB)');
console.log('[mux] vo    :', VO, '(' + (fs.statSync(VO).size / 1024 / 1024).toFixed(1) + ' MB)');
console.log('[mux] music :', hasMusic ? MUSIC + ' (' + (fs.statSync(MUSIC).size / 1024 / 1024).toFixed(1) + ' MB)' : 'NOT FOUND - VO only');

let args;
if (hasMusic) {
  // [1:a] = VO, [2:a] = music. Duck music with sidechaincompress keyed to VO.
  const fg =
    '[1:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.4,asplit=2[voA][voB];' +
    '[2:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.55[mus];' +
    '[mus][voA]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400:makeup=1[ducked];' +
    '[ducked][voB]amix=inputs=2:duration=longest:normalize=0[mix];' +
    '[mix]alimiter=limit=0.97[aout]';
  args = [
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
} else {
  // VO only
  const fg = '[1:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.5,alimiter=limit=0.97[aout]';
  args = [
    '-y',
    '-i', VIDEO,
    '-i', VO,
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
}

console.log('[mux] running ffmpeg');
const r = spawnSync(ffmpegPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
if (r.status !== 0) { console.error('[mux] ffmpeg failed'); process.exit(r.status || 1); }

const size = fs.statSync(OUT).size / 1024 / 1024;
console.log('\n[done]', OUT, `(${size.toFixed(1)} MB)`);
