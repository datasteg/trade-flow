#!/usr/bin/env bash
# Screenshots of one event page, both languages, desktop (1280 px) and phone (375 px), tiled into 1,300-px slices
# that are readable when opened one by one (a whole page in one PNG is not). Needs a running site and google-chrome.
#   pnpm dev                                   # :3003, compiles a page on its first request
#   pnpm build && pnpm --filter @trade-flow/web exec next start -p 3412     # a production build (stop it by PID)
#   .claude/skills/event-page-review/scripts/shots.sh <slug> [base-url] [out-dir]
set -eu
slug=$1
base=${2:-http://localhost:3003}
out=${3:-${TMPDIR:-/tmp}/event-shots/$slug}
mkdir -p "$out"
for lang in en ko; do
  curl -s -o /dev/null "$base/$lang/events/$slug" || true
  for w in 1280 375; do
    h=$([ "$w" = 1280 ] && echo 8000 || echo 16000)
    f="$out/$lang-$w.png"
    google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars --window-size="$w,$h" \
      --virtual-time-budget=10000 --screenshot="$f" "$base/$lang/events/$slug" >/dev/null 2>&1
    convert "$f" -crop "${w}x1300" +repage "$out/$lang-$w-%02d.png"
    rm "$f"
  done
done
# drop tiles that are blank page bottom (one colour)
for f in "$out"/*-??.png; do
  if [ "$(convert "$f" -format '%[fx:standard_deviation]' info:)" = "0" ]; then rm "$f"; fi
done
ls "$out"
