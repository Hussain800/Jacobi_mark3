#!/usr/bin/env bash
# Emits NDJSON events for the JACOBI vo-fix swarm:
#   - swarm/agent registry changes
#   - file mutations in _render/
#   - presence of new artifacts (render-vo-v3.py, vo-v3.wav, mux-yc-fixed.js, JACOBI_film_yc_fixed.mp4)
#
# Stays selective: one line per real event, never raw output.

cd "C:/Hussain new/JACOBI CLEAN/Jacobi/Jacobi_demo_video/_render" || exit 1

declare -A SEEN_FILES
declare -A SEEN_SIZE

emit() {
  ts=$(date -u +%H:%M:%S)
  printf '%s [swarm] %s\n' "$ts" "$1"
}

emit "stream opened · swarm=swarm-1780222272833-kovd0f · agents=diagnoser,vo-fixer,timing-validator,mux-coordinator"

WATCH=(
  "render-vo-v3.py"
  "render-vo-v3.log"
  "vo-v3.wav"
  "diagnosis-report.md"
  "mux-yc-fixed.js"
  "JACOBI_film_yc_fixed.mp4"
)

# Initial scan
for f in "${WATCH[@]}"; do
  if [ -f "$f" ]; then
    SEEN_FILES[$f]=1
    SEEN_SIZE[$f]=$(stat -c%s "$f" 2>/dev/null || echo 0)
  fi
done

deadline=$(( $(date +%s) + 600 ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  for f in "${WATCH[@]}"; do
    if [ -f "$f" ]; then
      size=$(stat -c%s "$f" 2>/dev/null || echo 0)
      if [ -z "${SEEN_FILES[$f]}" ]; then
        SEEN_FILES[$f]=1
        SEEN_SIZE[$f]=$size
        emit "FILE CREATED   $f  ($(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B"))"
      elif [ "$size" != "${SEEN_SIZE[$f]}" ]; then
        SEEN_SIZE[$f]=$size
        emit "FILE GROW      $f  → $(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B")"
      fi
    fi
  done
  # Stop early once mux exists
  if [ -f "JACOBI_film_yc_fixed.mp4" ] && [ -n "${SEEN_FILES[JACOBI_film_yc_fixed.mp4]}" ]; then
    sleep 2
    emit "stream closing · final artifact present"
    break
  fi
  sleep 1
done
