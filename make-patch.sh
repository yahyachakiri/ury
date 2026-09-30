#!/usr/bin/env bash
# Generates patches/01-branding-replacement.patch including binary images.
# Run from the root of your ury fork.
#
# Usage:
#   ./make-patch.sh                # committed changes: pinned upstream commit -> HEAD
#   ./make-patch.sh <commit-ish>   # use a different base
#
# For uncommitted changes, replace the git diff line with:
#   git diff --binary HEAD -- "${FILES[@]}" > "$OUT"

set -euo pipefail

BASE="${1:-71b59edac14ea4c7ce4a108b4ea1bdf714803fb5}"
OUT="patches/01-branding-replacement.patch"

mkdir -p patches

# Only the files that belong to Patch 01, so other patches are not mixed in.
# Files that did not change are simply skipped by git.
FILES=(
  pos/public/ury.ico
  pos/public/ury_pos.png
  pos/index.html
  pos/src/components/HufLogo.tsx
  frontend/Public/URY-bg.png
  frontend/Public/photo_2026-08-19_13-24-09.jpg
  frontend/src/pages/Dashboard/KPIGrid.tsx
  mosaic/src/assets/logos/mosaic.jpg
)

# --binary is what makes the images part of the patch.
git diff --binary "$BASE" HEAD -- "${FILES[@]}" > "$OUT"

echo "Wrote $OUT"
git apply --stat "$OUT"
echo
echo "Test on a clean checkout of the base with:"
echo "  git apply --check $OUT && git apply $OUT"