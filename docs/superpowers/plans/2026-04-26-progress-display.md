# Progress Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить плоский список сырых системных событий на раскрывающийся блок с переводами и счётчиком.

**Architecture:** Все изменения — только в `src/view.ts`. Три независимых улучшения: (1) collapsible-заголовок вместо `metricsEl` + обновление `updateMetrics()`, (2) перевод system-событий, (3) авто-раскрытие/сворачивание при старте/финише.

**Tech Stack:** TypeScript, Obsidian ItemView API (DOM-методы: `createEl`, `addClass`, `style.display`).

---

## Карта файлов

| Файл | Действие | Что меняется |
|---|---|---|
| `src/view.ts` | Modify | Поля класса, `onOpen`, `setRunning`, `finish`, `appendEvent`, `updateMetrics` |

---

### Task 1: Collapsible-заголовок и счётчик (заменяет `metricsEl`)

`metricsEl` удаляется из класса — `updateMetrics()` обновляется в той же задаче, иначе сборка сломается.

**Files:**
- Modify: `src/view.ts`

- [ ] **Шаг 1: Заменить поле `metricsEl` тремя новыми полями**

В блоке полей класса (строки 14–36) найти строку:
```typescript
private metricsEl!: HTMLElement;
```
Заменить на:
```typescript
private progressToggle!: HTMLElement;
private progressCount!: HTMLElement;
private stepsOpen = true;
```

- [ ] **Шаг 2: Переписать блок `progressHeader` в `onOpen()` (строки 109–114)**

Заменить:
```typescript
const progressHeader = root.createDiv("llm-wiki-progress-header");
progressHeader.createEl("h4", { text: "Прогресс" });
this.metricsEl = progressHeader.createDiv("llm-wiki-metrics");
this.metricsEl.setText("—");

this.stepsEl = root.createDiv("llm-wiki-steps");
```

На:
```typescript
const progressHeader = root.createDiv("llm-wiki-progress-header");
const progressH4 = progressHeader.createEl("h4", { cls: "llm-wiki-progress-title" });
this.progressToggle = progressH4.createSpan({ cls: "llm-wiki-progress-arrow", text: "▶" });
progressH4.appendText(" Ход выполнения ");
this.progressCount = progressH4.createSpan({ cls: "llm-wiki-progress-count muted", text: "" });
progressHeader.addEventListener("click", () => this.toggleSteps());

this.stepsEl = root.createDiv("llm-wiki-steps");
this.stepsEl.style.display = "none";
```

- [ ] **Шаг 3: Добавить метод `toggleSteps()` — перед `updateMetrics()`**

```typescript
private toggleSteps(): void {
  this.stepsOpen = !this.stepsOpen;
  this.stepsEl.style.display = this.stepsOpen ? "" : "none";
  this.progressToggle.setText(this.stepsOpen ? "▼" : "▶");
}
```

- [ ] **Шаг 4: Обновить `updateMetrics()` — убрать все ссылки на `metricsEl`**

Заменить весь метод:
```typescript
private updateMetrics(): void {
  if (this.state !== "running") {
    this.metricsEl.setText("—");
    return;
  }
  const dur = ((Date.now() - this.startTs) / 1000).toFixed(1);
  this.metricsEl.setText(`шагов: ${this.stepCount} · инструментов: ${this.toolCount} · ${dur}s`);
}
```

На:
```typescript
private updateMetrics(): void {
  if (this.state !== "running") {
    this.progressCount.setText("");
    return;
  }
  const dur = ((Date.now() - this.startTs) / 1000).toFixed(1);
  this.progressCount.setText(`${this.stepCount} шагов · ${dur}s`);
}
```

- [ ] **Шаг 5: Запустить сборку — убедиться в отсутствии ошибок**

```bash
npm run build 2>&1 | tail -20
```
Ожидаем: сборка без ошибок.

- [ ] **Шаг 6: Коммит**

```bash
git add src/view.ts
git commit -m "feat(plugin): collapsible-заголовок прогресса, счётчик шагов, убран metricsEl"
```

---

### Task 2: Авто-раскрытие при старте и авто-сворачивание при финише

**Files:**
- Modify: `src/view.ts`

- [ ] **Шаг 1: В `setRunning()` раскрывать блок**

В методе `setRunning()` (строка ~168) после строки `this.assistantBuffer = "";` добавить:
```typescript
this.stepsOpen = true;
this.stepsEl.style.display = "";
this.progressToggle.setText("▼");
```

- [ ] **Шаг 2: В `finish()` сворачивать блок**

В методе `finish()` (строка ~242) после строки:
```typescript
if (this.tickHandle !== null) { window.clearInterval(this.tickHandle); this.tickHandle = null; }
```
Добавить:
```typescript
this.stepsOpen = false;
this.stepsEl.style.display = "none";
this.progressToggle.setText("▶");
```

- [ ] **Шаг 3: Запустить сборку**

```bash
npm run build 2>&1 | tail -20
```
Ожидаем: сборка без ошибок.

- [ ] **Шаг 4: Коммит**

```bash
git add src/view.ts
git commit -m "feat(plugin): авто-раскрытие при старте, авто-сворачивание при финише"
```

---

### Task 3: Перевод системных событий

**Files:**
- Modify: `src/view.ts`

- [ ] **Шаг 1: Добавить функцию `translateSystemEvent()` в конец файла — после функции `truncate()`**

```typescript
function translateSystemEvent(message: string): string {
  if (message === "hook_started") return "Запуск";
  if (message === "hook_response") return "Инициализация";
  if (message.startsWith("init")) {
    // message имеет вид "init (claude-sonnet-4-6)" из parseStreamLine()
    const model = message.replace(/^init\s*/, "").replace(/[()]/g, "").trim();
    return model ? `Инициализация (${model})` : "Инициализация";
  }
  return message;
}
```

- [ ] **Шаг 2: Обновить рендер `system`-событий в `appendEvent()`**

Найти блок (строки ~229–231):
```typescript
} else if (ev.kind === "system") {
  this.stepsEl.createDiv("llm-wiki-step muted").setText(`· ${ev.message}`);
  this.scrollSteps();
```

Заменить на:
```typescript
} else if (ev.kind === "system") {
  const step = this.stepsEl.createDiv("llm-wiki-step");
  const head = step.createDiv("llm-wiki-step-head");
  head.createSpan({ cls: "llm-wiki-step-icon" }).setText("⚙");
  head.createSpan({ cls: "llm-wiki-step-name muted" }).setText(translateSystemEvent(ev.message));
  this.scrollSteps();
```

- [ ] **Шаг 3: Запустить сборку**

```bash
npm run build 2>&1 | tail -20
```
Ожидаем: сборка без ошибок.

- [ ] **Шаг 4: Запустить тесты**

```bash
npm test 2>&1 | tail -30
```
Ожидаем: все тесты пройдены (`stream.test.ts`, `prompt.test.ts`).

- [ ] **Шаг 5: Коммит**

```bash
git add src/view.ts
git commit -m "feat(plugin): перевод системных событий (hook_started → Запуск и др.)"
```

---

## Ручная проверка после всех задач

После выполнения трёх задач — перезагрузить плагин в Obsidian (Settings → Community plugins → выключить/включить) и запустить операцию (Ingest или Query):

- [ ] Блок раскрыт `▼ Ход выполнения` сразу при запуске
- [ ] В начале видны `⚙ Запуск`, `⚙ Инициализация (claude-sonnet-4-6)` вместо `hook_started`/`init`
- [ ] Счётчик `N шагов · X.Xs` обновляется в реальном времени в заголовке
- [ ] После завершения блок сворачивается: `▶ Ход выполнения  6 шагов · 14.3s`
- [ ] Клик по заголовку переключает раскрытие в любой момент
