#!/usr/bin/env bash
# Generates what is derived from the reference app, so it can never drift from tested code:
#   templates/root/                      the starter app: the reference without its slices
#   templates/.claude/skills/*/references/  each build skill's worked example, copied from the reference slices
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
ref="$here/reference"
root="$here/templates/root"
ctx="$ref/src/slices/understanding-eventsourcing"
skills="$here/templates/.claude/skills"

rm -rf "$root" && mkdir -p "$root"
rsync -a --exclude node_modules --exclude .run --exclude bun.lock --exclude 'migrations/*' --exclude 'src/slices/*' --exclude src/examples --exclude .smoke "$ref/" "$root/"
mkdir -p "$root/migrations" "$root/src/slices"
# The context list, empty; the slices, router and statuses beside it are the reference's own, so they cannot drift.
sed -e '/^import {.*} from "\.\//d' -e 's|^const contexts: Record<string, ReadonlyArray<Slice>> = {.*}$|const contexts: Record<string, ReadonlyArray<Slice>> = {}|' \
  "$ref/src/slices/index.ts" | cat -s > "$root/src/slices/index.ts"
touch "$root/migrations/.gitkeep"

rm -rf "$skills"/*/references
example() { # <skill> <slice folder> — copy one reference slice (plus the context's events and index) as the skill's example
  local dest="$skills/$1/references/example"
  mkdir -p "$dest"
  cp "$ctx/events.ts" "$dest/events.ts"
  cp "$ctx/index.ts" "$dest/index.ts"
  cp -R "$ctx/$2" "$dest/$2"
}
example build-state-change add-item
example build-state-view cart-items
example build-automation publish-cart
# An automation that keeps its todo list in a read model of its own, on its own processor.
mkdir -p "$skills/build-automation/references/from-a-read-model"
cp "$ctx/events.ts" "$skills/build-automation/references/from-a-read-model/events.ts"
cp -R "$ctx/archive-item" "$skills/build-automation/references/from-a-read-model/archive-item"
# Time in a decision, with Temporal: a self-contained example, tested with the reference but not part of its app.
cp -R "$ref/src/examples/send-reminder" "$skills/build-state-change/references/time"
echo "synced templates/root and skill examples from reference/"
