# README Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить README.md на пользовательский документ с Quick Start для двух бэкендов и полным справочником настроек.

**Architecture:** Один файл README.md заменяет текущий. Smoke-test чеклист и инструкции для разработчиков переносятся в `docs/dev.md` (новый файл), чтобы README оставался чистым для бизнес-пользователей.

**Tech Stack:** Markdown, GitHub-flavoured (таблицы, blockquote, code blocks).

---

## Файлы

- Modify: `README.md` — полная перезапись
- Create: `docs/dev.md` — smoke-test чеклист + инструкции по сборке (перенос из старого README)

---

### Task 1: Перенести dev-контент в docs/dev.md

Забираем из текущего README секции «Сборка», «Установка в волт», «Разработка», «Smoke-test чеклист» — они нужны разработчику, не бизнес-пользователю.

**Files:**
- Create: `docs/dev.md`
- Modify: `README.md` (удалить перенесённые секции после Task 2)

- [ ] **Step 1: Создать docs/dev.md с dev-контентом**

Создать файл `docs/dev.md` со следующим содержимым:

```markdown
# LLM Wiki — для разработчиков

## Сборка

```bash
npm install
npm run build        # production build → main.js
npm run dev          # watch mode (esbuild)
npm test             # vitest (one-shot)
npm run test:watch   # vitest watch
```

Перед каждой сборкой (`npm run build`) автоматически поднимать patch-версию в `package.json` и `manifest.json`.

## Установка в волт (разработка)

```bash
ln -s $(pwd) ~/.config/obsidian/Plugins/obsidian-llm-wiki
```

Включить плагин: Settings → Community plugins → Installed plugins → LLM Wiki.

## Smoke-test чеклист (после каждой сборки)

1. **Сборка и установка**
   - `npm run build` без ошибок
   - Symlink в vault/.obsidian/plugins/
   - Плагин включён в настройках Obsidian

2. **Settings**
   - Заполнен `iclaudePath` (или настроен Native Agent)
   - Settings сохраняются после перезагрузки Obsidian

3. **Open panel**
   - Команда `LLM Wiki: Открыть панель` показывает side-panel

4. **Ingest активного файла**
   - Открыть любую `.md`-заметку
   - Запустить `LLM Wiki: Ingest активного файла`
   - В панели появляются шаги (Read, Write)
   - Финальный отчёт виден

5. **Query inline**
   - Команда `LLM Wiki: Query`, вопрос «Что такое SCD2?»
   - Ответ появляется в панели

6. **Query + save**
   - Команда `Query + сохранить` — после завершения Obsidian открыл созданную страницу

7. **Cancel**
   - Запустить ingest, нажать «Отменить» в первые 2с
   - В истории статус `cancelled`

8. **Lint**
   - `LLM Wiki: Lint домена` → выбрать домен → отчёт виден

9. **Ошибки**
   - Очистить путь к бэкенду → команда показывает Notice

10. **Race / single-flight**
    - Запустить ingest, не дожидаясь вызвать query → Notice «Уже выполняется»
```

- [ ] **Step 2: Проверить что файл создан**

```bash
cat docs/dev.md | head -5
```

Ожидаемый вывод: `# LLM Wiki — для разработчиков`

- [ ] **Step 3: Commit**

```bash
git add docs/dev.md
git commit -m "docs: extract dev/smoke-test content to docs/dev.md"
```

---

### Task 2: Написать новый README.md

**Files:**
- Modify: `README.md` — полная перезапись

- [ ] **Step 1: Перезаписать README.md**

Записать в `README.md` следующее содержимое (полный текст):

```markdown
# LLM Wiki — плагин Obsidian

Автоматически строит и пополняет wiki-базу знаний из ваших заметок с помощью LLM.

> Поддерживаемые бэкенды: **Ollama / OpenAI-compatible** (без облака) · **Claude Code** (Anthropic)

## Что умеет

- **Ingest** — разбирает заметку, извлекает сущности (люди, технологии, процессы, термины), создаёт и обновляет wiki-страницы
- **Query** — отвечает на вопрос по базе знаний; опционально сохраняет ответ как новую страницу с `[[WikiLinks]]`
- **Lint** — проверяет качество wiki-домена, находит неполные и устаревшие страницы
- **Init** — инициализирует новый домен с нуля (структура папок, `_schema.md`, `_index.md`)

Прогресс каждой операции виден в реальном времени в боковой панели Obsidian.

---

## Быстрый старт: Native Agent (Ollama)

Не требует внешних аккаунтов — LLM работает локально.

### 1. Установите Ollama

Скачайте с [ollama.com](https://ollama.com) и запустите:

```bash
ollama pull llama3.2
```

### 2. Установите плагин

Скопируйте папку плагина в vault:

```bash
# вариант — симлинк для разработки
ln -s /path/to/obsidian-llm-wiki ~/.config/obsidian/Plugins/obsidian-llm-wiki
```

Или скопируйте папку вручную в `<vault>/.obsidian/plugins/obsidian-llm-wiki/`.

### 3. Включите плагин

Obsidian → Settings → Community plugins → найти «LLM Wiki» → включить.

### 4. Настройте

Settings → LLM Wiki:

| Параметр | Значение |
|---|---|
| Backend | Native Agent (OpenAI-compatible) |
| Base URL | `http://localhost:11434/v1` |
| API Key | `ollama` |
| Модель | `llama3.2` |
| Temperature | `0.2` |
| Max tokens | `4096` |

### 5. Создайте домен

Домен — это пара «папка с источниками → папка wiki». Команда:

`Command Palette` → `LLM Wiki: Init домена` → введите имя домена (например, `work`) → снимите флаг Dry Run → запустите.

Плагин создаст структуру папок и служебные файлы (`_schema.md`, `_index.md`).

### 6. Первый Ingest

1. Откройте любую заметку в Obsidian
2. `Command Palette` → `LLM Wiki: Ingest активного файла`
3. Следите за прогрессом в боковой панели
4. После завершения — новые wiki-страницы появятся в папке домена

---

## Быстрый старт: Claude Code

Для пользователей с установленным [Claude Code CLI](https://claude.ai/code).

### 1. Требования

- Установленный `iclaude.sh` / `iclaude` / `claude` (Claude Code CLI)
- Скилл `llm-wiki` в директории `<repo>/.claude-isolated/skills/llm-wiki/`

### 2. Установите плагин

Аналогично шагам 2–3 секции Native Agent выше.

### 3. Настройте

Settings → LLM Wiki:

| Параметр | Значение |
|---|---|
| Backend | Claude Code |
| Путь к Claude Code | `/home/user/Documents/Project/iclaude/iclaude.sh` |
| Путь к навыку llm-wiki | `/home/user/Documents/Project/iclaude/.claude-isolated/skills/llm-wiki` |
| Модель | `sonnet` |
| Таймауты | `300/300/600/3600` |

### 4. Первый Ingest

Аналогично шагу 6 секции Native Agent выше.

---

## Команды

Все команды доступны через `Command Palette` (Ctrl+P / Cmd+P).

| Команда | Действие | Результат |
|---|---|---|
| `LLM Wiki: Открыть панель` | Показать боковую панель | Живой лог операций, история |
| `LLM Wiki: Ingest активного файла` | Извлечь сущности из текущей заметки | Новые/обновлённые wiki-страницы |
| `LLM Wiki: Query` | Задать вопрос по базе знаний | Ответ в панели с `[[WikiLinks]]` |
| `LLM Wiki: Query + сохранить` | Вопрос + сохранить ответ | Новая wiki-страница, открывается автоматически |
| `LLM Wiki: Lint домена` | Проверить качество wiki | Отчёт о проблемах в панели |
| `LLM Wiki: Init домена` | Инициализировать новый домен | Структура wiki-папок и служебные файлы |
| `LLM Wiki: Отменить операцию` | Остановить текущую операцию | SIGTERM → SIGKILL через 3с |

---

## Справочник настроек

### Общие (оба бэкенда)

| Параметр | Описание | По умолчанию |
|---|---|---|
| Backend | `claude-code` или `native-agent` | `claude-code` |
| Лимит истории | Максимум записей в истории панели | `20` |
| Лог агента (JSONL) | Абсолютный путь к файлу лога; пусто — отключено | — |

### Native Agent

| Параметр | Описание | По умолчанию |
|---|---|---|
| Base URL | OpenAI-compatible endpoint | `http://localhost:11434/v1` |
| API Key | `ollama` для Ollama; `sk-...` для OpenAI | `ollama` |
| Модель | Имя модели: `llama3.2`, `mistral`, `gpt-4o`... | `llama3.2` |
| Temperature | `0.0`–`1.0`. Низкая (`0.1`–`0.3`) = точные факты | `0.2` |
| Max tokens | Макс. токенов в ответе; ≥ 4096 для wiki-страниц | `4096` |
| Top-p | Nucleus sampling `0.0`–`1.0`; пусто = отключено | — |
| Request timeout (сек) | Таймаут HTTP; для больших моделей Ollama ≥ 300 | `300` |
| num_ctx | Размер контекста (только Ollama); пусто = дефолт модели | — |
| System prompt | Системный промпт; перезаписывает встроенный при изменении | встроенный |

### Claude Code

| Параметр | Описание | По умолчанию |
|---|---|---|
| Путь к Claude Code | Полный путь к `iclaude.sh` / `iclaude` / `claude` | — |
| Путь к навыку llm-wiki | Полный путь к папке навыка (содержит `shared/domain-map-*.json`) | — |
| Allowed tools | Список через запятую | `Read,Edit,Write,Glob,Grep` |
| Модель | Пресет (`opus`/`sonnet`/`haiku`) или произвольный ID (`claude-opus-4-7`) | дефолт claude |
| Таймауты | `ingest/query/lint/init` в секундах через `/` | `300/300/600/3600` |
| Показывать raw JSON | Отображать сырые JSON-события в панели | выкл |

---

> Инструкции для разработчиков, сборка и smoke-test чеклист — в [docs/dev.md](docs/dev.md).
```

- [ ] **Step 2: Проверить что README начинается правильно**

```bash
head -5 README.md
```

Ожидаемый вывод:
```
# LLM Wiki — плагин Obsidian

Автоматически строит и пополняет wiki-базу знаний из ваших заметок с помощью LLM.
```

- [ ] **Step 3: Проверить наличие всех ключевых секций**

```bash
grep -n "^##" README.md
```

Ожидаемый вывод (порядок и заголовки):
```
## Что умеет
## Быстрый старт: Native Agent (Ollama)
## Быстрый старт: Claude Code
## Команды
## Справочник настроек
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for business users (Quick Start + settings reference)"
```

---

## Self-Review: покрытие спека

Спек: `docs/superpowers/specs/2026-04-28-readme-design.md`

| Требование из спека | Task |
|---|---|
| Шапка с описанием и бэкендами | Task 2, Step 1 (секция шапки) |
| Что умеет (4 пункта) | Task 2, Step 1 (секция «Что умеет») |
| Quick Start Ollama (6 шагов) | Task 2, Step 1 (секция Native Agent) |
| Таблица настроек Ollama в Quick Start | Task 2, Step 1 (шаг 4) |
| Quick Start Claude Code (4 шага) | Task 2, Step 1 (секция Claude Code) |
| Таблица настроек Claude Code в Quick Start | Task 2, Step 1 (шаг 3) |
| Таблица команд | Task 2, Step 1 (секция «Команды») |
| Справочник: общие настройки | Task 2, Step 1 (справочник → Общие) |
| Справочник: Native Agent | Task 2, Step 1 (справочник → Native Agent) |
| Справочник: Claude Code | Task 2, Step 1 (справочник → Claude Code) |
| Dev-контент НЕ в README | Task 1 (перенос в docs/dev.md) |
