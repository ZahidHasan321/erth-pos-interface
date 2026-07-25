#!/usr/bin/env bash
# Compile every out/tex/guide.<lang>.tex to out/guide.<lang>.pdf with XeLaTeX.
#
# LuaLaTeX because the Hindi edition mixes Devanagari prose with Latin UI labels
# and needs luaotfload's font fallback; XeLaTeX renders the uncovered script as
# empty boxes instead. latexmk handles the multi-pass dance that a table of
# contents, a list of figures, and \ref cross-references all require.
set -euo pipefail

# CDPATH is set in some shells, and when it is, `cd` ECHOES the resolved
# directory to stdout — which command substitution then captures, so $HERE ends
# up holding two newline-separated paths. Clearing it per-call is the fix.
HERE="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# Resolve through the parent rather than leaving a literal "/.." in the path.
OUT="$(CDPATH= cd -- "$HERE/.." && pwd -P)/out"
TEX="$OUT/tex"

shopt -s nullglob
files=("$TEX"/guide.*.tex)
if [ ${#files[@]} -eq 0 ]; then
  echo "No .tex in $TEX — run \`pnpm tex\` first." >&2
  exit 1
fi

for f in "${files[@]}"; do
  lang="$(basename "$f" .tex)"; lang="${lang#guide.}"
  echo "==> lualatex $lang"
  # -interaction=nonstopmode so a bad box never hangs waiting on stdin.
  if ! latexmk -lualatex -interaction=nonstopmode -halt-on-error \
       -outdir="$TEX" "$f" >"$TEX/$lang.build.log" 2>&1; then
    echo "    FAILED — last 30 lines of $TEX/$lang.build.log:" >&2
    tail -30 "$TEX/$lang.build.log" >&2
    exit 1
  fi
  mv "$TEX/guide.$lang.pdf" "$OUT/guide.$lang.pdf"
  # PDF object streams are compressed, so grepping the raw bytes for /Type /Page
  # counts zero. Ask a tool that actually parses the file.
  pages=$(pdfinfo "$OUT/guide.$lang.pdf" 2>/dev/null | awk '/^Pages:/{print $2}')
  echo "    wrote out/guide.$lang.pdf (${pages} pages)"
done
