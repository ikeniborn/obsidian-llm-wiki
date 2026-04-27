#!/usr/bin/env bash
# mock-iclaude.sh — для интеграционного теста IclaudeRunner.
# Аргумент 1: путь к JSONL-фикстуре, которую отдадим в stdout построчно.
# Аргумент 2 (опционально): exit code (default 0).
# Аргумент 3 (опционально): "delay" — добавить sleep между строками.
set -euo pipefail

FIXTURE="${1:?fixture path required}"
EXIT_CODE="${2:-0}"
DELAY="${3:-}"

while IFS= read -r line || [[ -n "$line" ]]; do
  printf '%s\n' "$line"
  if [[ -n "$DELAY" ]]; then sleep "$DELAY"; fi
done < "$FIXTURE"

exit "$EXIT_CODE"
