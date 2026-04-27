# Interactive Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить поддержку `AskUserQuestion` в плагин — когда iclaude задаёт вопрос, пользователь видит модальное окно Obsidian и может ответить, после чего iclaude продолжает работу.

**Architecture:** Открываем stdin процесса (`"pipe"`), перехватываем `tool_use` с `name: "AskUserQuestion"` в парсере stream-json как новый RunEvent `ask_user`, контроллер показывает `WikiQuestionModal`, пишет ответ в stdin как `tool_result` JSON. "Пауза" реализуется естественно через `for await` — контроллер не вызывает следующий `next()` пока не закроется modal.

**Tech Stack:** TypeScript, Node.js `child_process`, Obsidian Modal API, Vitest

---

## Структура файлов

| Файл | Изменение |
|------|-----------|
| `src/types.ts` | Добавить `ask_user` в union RunEvent |
| `src/stream.ts` | В `mapAssistant()` перехватить `name === "AskUserQuestion"` → вернуть `ask_user` |
| `src/runner.ts` | `stdio[0]` → `"pipe"`; хранить `child.stdin`; добавить `sendToolResult()` |
| `src/controller.ts` | В `for await` обрабатывать `ask_user`: await modal, затем `runner.sendToolResult()` |
| `src/view.ts` | Добавить `WikiQuestionModal`; рендер `ask_user` в `appendEvent()` |
| `tests/stream.test.ts` | Тест: AskUserQuestion tool_use → ask_user event |
| `tests/runner.integration.test.ts` | Тест: runner паузируется, sendToolResult продолжает |
| `tests/fixtures/stream-ask-user-pre.jsonl` | Фикстура: system + AskUserQuestion tool_use |
| `tests/fixtures/stream-ask-user-post.jsonl` | Фикстура: result после ответа |
| `tests/fixtures/mock-iclaude-interactive.sh` | Mock: выдаёт pre-фикстуру, читает stdin, выдаёт post-фикстуру |

---

### Task 1: Добавить `ask_user` RunEvent и обновить парсер

**Files:**
- Modify: `src/types.ts:18-25`
- Modify: `src/stream.ts:39-51`
- Test: `tests/stream.test.ts`

- [ ] **Step 1: Написать падающий тест для AskUserQuestion парсинга**

Добавить в `tests/stream.test.ts` после последнего `it(...)`:

```typescript
it("maps AskUserQuestion tool_use to ask_user event", () => {
  const line = JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "aq1",
        name: "AskUserQuestion",
        input: {
          prompt: "Подтвердить entity_types?",
          options: ["подтвердить", "исключить типы", "отменить"],
        },
      }],
    },
  });
  const ev = parseStreamLine(line);
  expect(ev).toEqual({
    kind: "ask_user",
    question: "Подтвердить entity_types?",
    options: ["подтвердить", "исключить типы", "отменить"],
    toolUseId: "aq1",
  });
});

it("maps AskUserQuestion with no options to ask_user with empty options array", () => {
  const line = JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "aq2",
        name: "AskUserQuestion",
        input: { prompt: "Введите id типов:", options: [] },
      }],
    },
  });
  const ev = parseStreamLine(line);
  expect(ev).toEqual({
    kind: "ask_user",
    question: "Введите id типов:",
    options: [],
    toolUseId: "aq2",
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться что падает**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npx vitest run tests/stream.test.ts
```

Ожидаемо: FAIL — `ask_user` не существует в типах.

- [ ] **Step 3: Добавить `ask_user` в RunEvent**

В `src/types.ts` строка 25, после `| { kind: "exit"; code: number };` → вставить перед точкой с запятой:

```typescript
export type RunEvent =
  | { kind: "system"; message: string }
  | { kind: "tool_use"; name: string; input: unknown }
  | { kind: "tool_result"; ok: boolean; preview?: string }
  | { kind: "assistant_text"; delta: string }
  | { kind: "result"; durationMs: number; usdCost?: number; text: string }
  | { kind: "error"; message: string }
  | { kind: "exit"; code: number }
  | { kind: "ask_user"; question: string; options: string[]; toolUseId: string };
```

- [ ] **Step 4: Обновить `mapAssistant()` в `src/stream.ts`**

Заменить строки 44-45 (`if (block?.type === "tool_use")`) на:

```typescript
  if (block?.type === "tool_use") {
    if (block.name === "AskUserQuestion") {
      return {
        kind: "ask_user",
        question: String(block.input?.prompt ?? ""),
        options: Array.isArray(block.input?.options)
          ? (block.input.options as unknown[]).map(String)
          : [],
        toolUseId: String(block.id ?? ""),
      };
    }
    return { kind: "tool_use", name: String(block.name ?? "?"), input: block.input };
  }
```

- [ ] **Step 5: Запустить тест и убедиться что проходит**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npx vitest run tests/stream.test.ts
```

Ожидаемо: все тесты PASS.

- [ ] **Step 6: Запустить все тесты**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npm test
```

Ожидаемо: все PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
git add src/types.ts src/stream.ts tests/stream.test.ts
git commit -m "feat: add ask_user RunEvent and parse AskUserQuestion tool_use"
```

---

### Task 2: Открыть stdin и добавить `sendToolResult()` в runner

**Files:**
- Modify: `src/runner.ts`
- Create: `tests/fixtures/stream-ask-user-pre.jsonl`
- Create: `tests/fixtures/stream-ask-user-post.jsonl`
- Create: `tests/fixtures/mock-iclaude-interactive.sh`
- Test: `tests/runner.integration.test.ts`

- [ ] **Step 1: Создать фикстуру `stream-ask-user-pre.jsonl`**

Создать файл `tests/fixtures/stream-ask-user-pre.jsonl`:

```jsonl
{"type":"system","subtype":"init","session_id":"s1","model":"claude-sonnet-4-6","cwd":"/home/u"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"aq1","name":"AskUserQuestion","input":{"prompt":"Подтвердить конфигурацию?","options":["подтвердить","отменить"]}}]}}
```

- [ ] **Step 2: Создать фикстуру `stream-ask-user-post.jsonl`**

Создать файл `tests/fixtures/stream-ask-user-post.jsonl`:

```jsonl
{"type":"result","subtype":"success","duration_ms":1000,"is_error":false,"result":"Домен настроен","total_cost_usd":0.005}
```

- [ ] **Step 3: Создать `mock-iclaude-interactive.sh`**

Создать файл `tests/fixtures/mock-iclaude-interactive.sh`:

```bash
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

# Phase 2: выдать строки post-фикстуры
while IFS= read -r line || [[ -n "$line" ]]; do
  printf '%s\n' "$line"
done < "$POST_FIXTURE"

exit "$EXIT_CODE"
```

Сделать исполняемым:
```bash
chmod +x /home/ikeniborn/Documents/Project/obsidian-llm-wiki/tests/fixtures/mock-iclaude-interactive.sh
```

- [ ] **Step 4: Написать падающий тест**

Добавить в `tests/runner.integration.test.ts` после последнего `it(...)`:

```typescript
it("pauses on ask_user and resumes after sendToolResult", async () => {
  const PRE = resolve(FIXTURE_DIR, "stream-ask-user-pre.jsonl");
  const POST = resolve(FIXTURE_DIR, "stream-ask-user-post.jsonl");
  const MOCK_I = resolve(FIXTURE_DIR, "mock-iclaude-interactive.sh");

  const runner = new IclaudeRunner({
    iclaudePath: MOCK_I,
    allowedTools: [],
    extraArgsForFixture: [PRE, POST],
  });

  const events: RunEvent[] = [];
  for await (const ev of runner.run({
    operation: "ingest",
    args: ["x"],
    cwd: process.cwd(),
    signal: new AbortController().signal,
    timeoutMs: 10_000,
  })) {
    events.push(ev);
    if (ev.kind === "ask_user") {
      runner.sendToolResult(ev.toolUseId, "подтвердить");
    }
  }

  expect(events.some(e => e.kind === "ask_user")).toBe(true);
  const askEv = events.find(e => e.kind === "ask_user") as Extract<RunEvent, { kind: "ask_user" }>;
  expect(askEv.question).toBe("Подтвердить конфигурацию?");
  expect(askEv.options).toEqual(["подтвердить", "отменить"]);
  expect(askEv.toolUseId).toBe("aq1");
  expect(events.some(e => e.kind === "result")).toBe(true);
  const result = events.find(e => e.kind === "result") as Extract<RunEvent, { kind: "result" }>;
  expect(result.text).toBe("Домен настроен");
  const exit = events[events.length - 1] as Extract<RunEvent, { kind: "exit" }>;
  expect(exit.code).toBe(0);
});
```

- [ ] **Step 5: Запустить тест и убедиться что падает**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npx vitest run tests/runner.integration.test.ts
```

Ожидаемо: FAIL — `sendToolResult` не существует.

- [ ] **Step 6: Обновить `src/runner.ts`**

Полная новая версия файла:

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { parseStreamLine } from "./stream";
import type { RunEvent, RunRequest } from "./types";
import { buildPrompt } from "./prompt";

interface RunnerConfig {
  iclaudePath: string;
  allowedTools: string[];
  /** Модель claude (--model). Пусто = не передавать флаг. */
  model?: string;
  /** Test-only: extra args appended after the prompt (used to drive mock-iclaude.sh). */
  extraArgsForFixture?: string[];
}

const STDERR_BUFFER_BYTES = 64 * 1024;
const SIGTERM_GRACE_MS = 3000;

export class IclaudeRunner {
  private stdin: import("node:stream").Writable | null = null;

  constructor(private cfg: RunnerConfig) {}

  sendToolResult(toolUseId: string, answer: string): void {
    if (!this.stdin || this.stdin.destroyed) return;
    const payload = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseId, content: answer }],
      },
    });
    this.stdin.write(payload + "\n");
  }

  async *run(req: RunRequest): AsyncGenerator<RunEvent, void, void> {
    const prompt = buildPrompt({ operation: req.operation, args: req.args });
    const claudeArgs: string[] = [
      "--",
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--allowed-tools",
      this.cfg.allowedTools.join(","),
    ];
    if (this.cfg.model) claudeArgs.push("--model", this.cfg.model);
    const args = this.cfg.extraArgsForFixture ? [...this.cfg.extraArgsForFixture] : claudeArgs;

    const child: ChildProcess = spawn(this.cfg.iclaudePath, args, {
      cwd: req.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.stdin = child.stdin;

    const stderrBuf: Buffer[] = [];
    let stderrBytes = 0;
    child.stderr!.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      stderrBuf.push(chunk);
      while (stderrBytes > STDERR_BUFFER_BYTES && stderrBuf.length > 1) {
        const dropped = stderrBuf.shift()!;
        stderrBytes -= dropped.length;
      }
    });

    const onAbort = () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, SIGTERM_GRACE_MS);
    };
    if (req.signal.aborted) onAbort();
    else req.signal.addEventListener("abort", onAbort, { once: true });

    const timeoutHandle = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    }, req.timeoutMs);

    const queue: RunEvent[] = [];
    let resolveNext: ((v: void) => void) | null = null;
    const wake = () => {
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      const ev = parseStreamLine(line);
      if (ev) queue.push(ev);
      wake();
    });

    let exited = false;
    let exitCode = 0;
    child.on("error", (err) => {
      queue.push({ kind: "error", message: `spawn error: ${err.message}` });
      exited = true;
      exitCode = -1;
      this.stdin = null;
      wake();
    });
    child.on("close", (code) => {
      if (stderrBuf.length > 0 && code !== 0) {
        const tail = Buffer.concat(stderrBuf).toString("utf-8").slice(-4096);
        queue.push({ kind: "error", message: `stderr: ${tail}` });
      }
      exited = true;
      exitCode = code ?? -1;
      this.stdin = null;
      wake();
    });

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (exited) break;
        await new Promise<void>((r) => (resolveNext = r));
      }
      yield { kind: "exit", code: exitCode };
    } finally {
      clearTimeout(timeoutHandle);
      req.signal.removeEventListener("abort", onAbort);
      rl.close();
      this.stdin = null;
    }
  }
}
```

- [ ] **Step 7: Запустить тест и убедиться что проходит**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npx vitest run tests/runner.integration.test.ts
```

Ожидаемо: все PASS.

- [ ] **Step 8: Запустить все тесты**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npm test
```

Ожидаемо: все PASS.

- [ ] **Step 9: Commit**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
git add src/runner.ts tests/fixtures/stream-ask-user-pre.jsonl tests/fixtures/stream-ask-user-post.jsonl tests/fixtures/mock-iclaude-interactive.sh tests/runner.integration.test.ts
git commit -m "feat: open stdin pipe and add sendToolResult to IclaudeRunner"
```

---

### Task 3: Обработать `ask_user` в WikiController

**Files:**
- Modify: `src/controller.ts:128-138`

- [ ] **Step 1: Обновить `dispatch()` в `src/controller.ts`**

Найти строки 128-138 (цикл `for await`):

```typescript
    try {
      for await (const ev of runner.run({ operation: op, args, cwd: spawnCwd, signal: ctrl.signal, timeoutMs })) {
        view.appendEvent(ev);
        this.collectStep(ev, steps);
        if (ev.kind === "result") finalText = ev.text;
        if (ev.kind === "error") status = "error";
        if (ev.kind === "exit") {
          if (ev.code !== 0 && status === "done") status = "error";
          if (ctrl.signal.aborted) status = "cancelled";
        }
      }
    }
```

Заменить на:

```typescript
    try {
      for await (const ev of runner.run({ operation: op, args, cwd: spawnCwd, signal: ctrl.signal, timeoutMs })) {
        if (ev.kind === "ask_user") {
          view.appendEvent(ev);
          try {
            const answer = await view.showQuestionModal(ev.question, ev.options);
            runner.sendToolResult(ev.toolUseId, answer);
          } catch {
            ctrl.abort();
          }
          continue;
        }
        view.appendEvent(ev);
        this.collectStep(ev, steps);
        if (ev.kind === "result") finalText = ev.text;
        if (ev.kind === "error") status = "error";
        if (ev.kind === "exit") {
          if (ev.code !== 0 && status === "done") status = "error";
          if (ctrl.signal.aborted) status = "cancelled";
        }
      }
    }
```

- [ ] **Step 2: Запустить все тесты** (TypeScript-ошибка ожидаема — `showQuestionModal` ещё не существует на view)

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npm test
```

Ожидаемо: ошибка компиляции TypeScript о `showQuestionModal`. Это нормально — Task 4 добавит метод.

- [ ] **Step 3: Commit**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
git add src/controller.ts
git commit -m "feat: handle ask_user event in WikiController — await modal before sendToolResult"
```

---

### Task 4: Добавить `WikiQuestionModal` и рендер `ask_user` в view

**Files:**
- Modify: `src/view.ts`

- [ ] **Step 1: Найти место для нового класса в `src/view.ts`**

Открыть `src/view.ts`. Найти конец файла — после последнего закрывающего `}` добавить новый класс.

Также найти метод `appendEvent(ev: RunEvent)` — добавить в него обработку `ask_user`.

- [ ] **Step 2: Добавить `showQuestionModal()` метод в класс `LlmWikiView`**

Найти в `LlmWikiView` метод `setRunning` или любой последний публичный метод. После него добавить:

```typescript
  showQuestionModal(question: string, options: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const modal = new WikiQuestionModal(this.app, question, options, resolve, reject);
      modal.open();
    });
  }
```

- [ ] **Step 3: Добавить рендер `ask_user` в `appendEvent()`**

Найти в `appendEvent(ev: RunEvent)` существующие ветки (tool_use, tool_result, etc.). Добавить ветку для `ask_user`:

```typescript
    if (ev.kind === "ask_user") {
      const el = this.stepsEl.createDiv("llm-wiki-step llm-wiki-step--ask");
      el.createSpan({ text: "⏳ Ожидание ответа…" });
      return;
    }
```

- [ ] **Step 4: Добавить класс `WikiQuestionModal` в конец `src/view.ts`**

После закрывающей `}` класса `LlmWikiView` добавить:

```typescript
class WikiQuestionModal extends Modal {
  constructor(
    app: App,
    private question: string,
    private options: string[],
    private resolve: (answer: string) => void,
    private reject: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h3", { text: "LLM Wiki — требуется ответ" });
    contentEl.createEl("p", { text: this.question });

    if (this.options.length > 0) {
      const btnRow = contentEl.createDiv("llm-wiki-modal-options");
      for (const opt of this.options) {
        const btn = btnRow.createEl("button", { text: opt });
        btn.addEventListener("click", () => {
          this.resolve(opt);
          this.close();
        });
      }
    } else {
      const input = contentEl.createEl("input", {
        type: "text",
        cls: "llm-wiki-modal-input",
      });
      input.focus();
      const submit = () => {
        const val = input.value.trim();
        if (!val) return;
        this.resolve(val);
        this.close();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      contentEl.createEl("button", { text: "ОК" }).addEventListener("click", submit);
    }

    const cancelBtn = contentEl.createEl("button", {
      text: "Отменить",
      cls: "mod-warning",
    });
    cancelBtn.addEventListener("click", () => {
      this.reject();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 5: Убедиться что `App` импортирован в `src/view.ts`**

Проверить первую строку `src/view.ts`. Если `App` уже есть в импорте `obsidian` — ничего не делать. Если нет — добавить `App` в список импортов:

```typescript
import { App, ItemView, WorkspaceLeaf, /* ... */ } from "obsidian";
```

- [ ] **Step 6: Запустить все тесты**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npm test
```

Ожидаемо: все PASS.

- [ ] **Step 7: Запустить build для проверки TypeScript**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npm run build
```

Ожидаемо: успешная компиляция без ошибок.

- [ ] **Step 8: Commit**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
git add src/view.ts
git commit -m "feat: add WikiQuestionModal and ask_user rendering in LlmWikiView"
```

---

### Task 5: Финальная проверка

**Files:** (только чтение)

- [ ] **Step 1: Запустить полный тест-сьют**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npm test
```

Ожидаемо: все PASS.

- [ ] **Step 2: Запустить build**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npm run build
```

Ожидаемо: `main.js` собран без ошибок.

- [ ] **Step 3: Проверить что старые операции не сломаны**

Убедиться что в `src/runner.ts` изменение `stdio[0]` с `"ignore"` на `"pipe"` не ломает существующие интеграционные тесты (они используют `mock-iclaude.sh` который не читает stdin — это нормально, открытый stdin просто останется без данных и не заблокирует процесс).

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
npx vitest run tests/runner.integration.test.ts
```

Ожидаемо: все 4 теста PASS (включая новый).

- [ ] **Step 4: Проверить git log**

```bash
cd /home/ikeniborn/Documents/Project/obsidian-llm-wiki
git log --oneline -5
```

Ожидаемо: 4 коммита фичи на месте.
