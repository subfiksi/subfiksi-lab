#!/bin/sh
# macOS / Linux: jalankan file ini untuk membuka MOXUP (memakai python3 bawaan sistem).
cd "$(dirname "$0")" || exit 1
(sleep 1; (open http://localhost:3210 || xdg-open http://localhost:3210) >/dev/null 2>&1) &
exec python3 -m http.server 3210 --bind 127.0.0.1
