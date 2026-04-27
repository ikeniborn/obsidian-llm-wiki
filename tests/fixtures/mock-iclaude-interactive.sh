#!/usr/bin/env bash
# mock-iclaude-interactive.sh — интерактивный mock для тестов ask_user.
# Аргумент 1: путь к pre-фикстуре (строки до вопроса).
# Аргумент 2: путь к post-фикстуре (строки после ответа).
# Аргумент 3 (опционально): exit code (default 0).
set -euo pipefail

PRE_FIXTURE="${1:?pre fixture path required}"
POST_FIXTURE="${2:?post fixture path required}"
EXIT_CODE="${3:-0}"

# Phase 1: выдать строки pre-фикстуры
while IFS= read -r line || [[ -n "$line" ]]; do
  printf '%s\n' "$line"
done < "$PRE_FIXTURE"

# Ждём tool_result от stdin (одна строка JSON)
IFS= read -r _tool_result || true

# Emit confirmation if we got actual content (not just EOF)
if [[ -n "$_tool_result" ]]; then
  printf '{"type":"system","subtype":"got_answer"}\n'
fi

# Phase 2: выдать строки post-фикстуры
while IFS= read -r line || [[ -n "$line" ]]; do
  printf '%s\n' "$line"
done < "$POST_FIXTURE"

exit "$EXIT_CODE"
