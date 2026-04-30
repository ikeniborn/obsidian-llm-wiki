# Domain-map → data.json: Design Spec

**Date:** 2026-04-30  
**Status:** Approved

## Problem

Домены хранятся во внешнем файле `domain-map-<vault>.json` через Node.js `fs`. Это требует настройки пути (`domainMapDir`), создаёт зависимость от файловой системы вне Obsidian API и усложняет `phases/init.ts`, который пишет в файл прямо из фазы.

## Goal

Перенести структуру domain-map в `data.json` плагина (стандартное хранилище Obsidian через `loadData`/`saveData`). Убрать внешний файл и настройку `domainMapDir`.

## Design

### Подход: `domain_created` RunEvent

Фаза `init` вместо вызова `addDomain()` выдаёт событие `{ kind: "domain_created", entry: DomainEntry }`. Контроллер перехватывает его в dispatch-цикле и сохраняет через `saveSettings()`.

---

## Section 1: Типы и хранилище

### `src/types.ts`

- Добавить `domains: DomainEntry[]` в `LlmWikiPluginSettings`
- Удалить `domainMapDir: string` из `LlmWikiPluginSettings`
- Добавить в `RunEvent` union: `| { kind: "domain_created"; entry: DomainEntry }`
- В `DEFAULT_SETTINGS`: `domains: []`, убрать `domainMapDir`

### `src/domain-map.ts`

Убрать весь файловый I/O (`node:fs`). Оставить только типы и чистую валидацию:

```ts
export interface EntityType { ... }
export interface DomainEntry { ... }
export interface AddDomainInput { ... }

// Чистая функция: null = ok, string = сообщение об ошибке
export function validateDomainId(id: string): string | null
```

Удалить: `readDomains`, `addDomain`, `domainMapPath`, `DomainMapFile`.

---

## Section 2: Controller и AgentRunner

### `src/controller.ts`

- Удалить `resolveDomainMapDir()`
- `loadDomains()` → `return this.plugin.settings.domains ?? []`
- `registerDomain()` → валидация через `validateDomainId`, push в `settings.domains`, `void saveSettings()`
- `buildAgentRunner()` → убрать `domainMapDir` из аргументов
- `dispatch()` → добавить обработчик:
  ```ts
  if (ev.kind === "domain_created") {
    this.plugin.settings.domains.push(ev.entry);
    void this.plugin.saveSettings();
  }
  ```

### `src/agent-runner.ts`

- Удалить `private domainMapDir: string`
- Убрать `domainMapDir` из вызова `runInit`

### `src/phases/init.ts`

- Удалить параметр `domainMapDir`
- Заменить блок с динамическим импортом `addDomain` (строки 120–141) на:
  ```ts
  yield { kind: "tool_use", name: "SaveDomain", input: { id: entry.id } };
  yield { kind: "domain_created", entry };
  yield { kind: "tool_result", ok: true };
  ```
- Убрать динамический `import("../domain-map")`

---

## Section 3: Settings UI, i18n, миграция, тесты

### `src/settings.ts`

- Удалить блок с `domainMapDir` (Setting для пути к файлу)

### `src/i18n.ts`

- Удалить ключи: `domainMapDir_name`, `domainMapDir_desc`, `domainMapDir_placeholder`, `refreshTitle` (во всех трёх локалях: en, ru, es)
- Обновить `addDomainNote`: убрать упоминание `domain-map-<vault>.json`, заменить на «запись сохраняется в настройках плагина»

### `src/main.ts` — миграция

В `loadSettings()`:
- Удалить строки миграции `domainMapDir` (строки 135–136)
- Добавить инициализацию: `domains: (data?.domains as DomainEntry[]) ?? []`
- Внешний файл `domain-map-<vault>.json` не читается — пользователь добавляет домены через UI или через `init`. Это сознательное решение: путь к файлу мог быть произвольным.

### Тесты

- `tests/domain-map.test.ts`: удалить тесты на `readDomains`/`addDomain`/`domainMapPath`; добавить тест на `validateDomainId`
- `tests/phases/init.test.ts`: убрать мок fs; добавить assert на `domain_created` event с корректным `entry`
- `tests/phases/ingest.test.ts`, `lint.test.ts`, `query.test.ts`: убрать `domainMapDir` из аргументов где он передавался

---

## Out of Scope

- Автоматическая миграция данных из существующего `domain-map-<vault>.json` — не реализуется
- UI-редактор доменов (edit/delete) — не в этой задаче
- Изменение структуры `DomainEntry` — не в этой задаче
