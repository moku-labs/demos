#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Process raw ElevenLabs SFX/music WAVs into web-ready MP3s under public/sfx/.
#
#   • One-shots — trim leading + trailing silence (ElevenLabs pads to ~0.48 s),
#     downmix to mono, encode MP3 128 kbps, 4 ms fade-in to kill the trim click.
#   • Beds      — keep stereo + full length (do NOT trim: it would break the
#     seamless loop ElevenLabs authored), encode MP3 144 kbps.
#
# The engine plays one file many ways (pitch via playbackRate, reverse, gain),
# so this only emits the ~15 base assets — see src/lib/sound/map.ts.
#
# Usage:  scripts/process-sfx.sh [SRC_DIR]      (default: ../../assets/sfx)
# Requires ffmpeg on PATH. Re-runnable + deterministic (overwrites outputs).
# ---------------------------------------------------------------------------
set -euo pipefail

SRC="${1:-../../assets/sfx}"
OUT="public/sfx"
mkdir -p "$OUT"

# Pick the first source file matching a glob, encode a trimmed mono one-shot.
oneshot() {
  local id="$1" glob="$2" src
  src="$(ls "$SRC"/$glob 2>/dev/null | head -1)" || true
  if [ -z "${src:-}" ]; then echo "MISS  $id  ($glob)"; return; fi
  ffmpeg -y -loglevel error -i "$src" \
    -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,afade=t=in:d=0.004" \
    -ac 1 -ar 44100 -b:a 128k "$OUT/$id.mp3"
  echo "OK    $id.mp3  <-  $(basename "$src")"
}

# Pick the first source file matching a glob, encode a loop-preserving stereo bed.
bed() {
  local id="$1" glob="$2" src
  src="$(ls "$SRC"/$glob 2>/dev/null | head -1)" || true
  if [ -z "${src:-}" ]; then echo "MISS  $id  ($glob)"; return; fi
  ffmpeg -y -loglevel error -i "$src" -ac 2 -ar 44100 -b:a 144k "$OUT/$id.mp3"
  echo "OK    $id.mp3  (bed)  <-  $(basename "$src")"
}

oneshot tap     'tap_*'
oneshot pop     'pop_*'
oneshot confirm 'confirm_*'
oneshot sparkle 'sparkle_*'
oneshot whoosh  'whoosh_*'
oneshot impact  'impact_*'
oneshot correct 'correct_*'
oneshot wrong   'wrong_*'
oneshot countup 'countup_*'
oneshot fanfare 'fanfare_*'
oneshot plucks  'plucks_*'
oneshot sting   'sting_*'

bed lobby  'Chill_playful_party-_*'
bed game   'bed.game_*'
bed podium 'bed.podium_*'

echo "Done → $OUT/"
ls -1 "$OUT"
