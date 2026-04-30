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

## Section 4: UI-редактор доменов

### `src/settings.ts` — секция «Domains»

После General-секции добавляется блок со списком доменов. Для каждого домена из `settings.domains`:

```
[имя домена (id)]    [Edit]  [Delete]
```

Кнопка **Edit** открывает `EditDomainModal`. Кнопка **Delete** удаляет домен из массива и вызывает `saveSettings()` (с Notice-подтверждением в виде `new Notice(...)`).

### Новый `EditDomainModal` в `src/modals.ts`

Поля модального окна:

| Поле | Тип ввода | Значение |
|------|-----------|---------|
| `name` | text | человекочитаемое название |
| `wiki_folder` | text | путь к папке wiki |
| `source_paths` | textarea | по одному пути на строку |
| `entity_types` | textarea (JSON) | сырой JSON-массив |
| `language_notes` | text | заметки о языке |

При Save: `entity_types` парсится через `JSON.parse` с валидацией (должен быть массив). Если невалидный JSON — ошибка под полем, модальное окно не закрывается. `source_paths` — textarea split по `\n`, trim + filter пустых строк.

### `src/i18n.ts` — новые ключи (en / ru / es)

- `domains_heading` — «Domains» / «Домены» / «Dominios»
- `editDomain` — «Edit» / «Редактировать» / «Editar»
- `deleteDomain` — «Delete» / «Удалить» / «Eliminar»
- `editDomainTitle` — «Edit domain» / «Редактирование домена» / «Editar dominio»
- `entityTypesLabel` — «Entity types (JSON array)» / «Типы сущностей (JSON-массив)» / «Tipos de entidad (array JSON)»
- `entityTypesError` — «Invalid JSON array» / «Невалидный JSON-массив» / «Array JSON inválido»
- `sourcePathsLabel` — «Source paths (one per line)» / «Пути источников (по одному на строку)» / «Rutas de origen (una por línea)»
- `confirmDeleteDomain` — «Delete domain "{id}"?» / «Удалить домен «{id}»?» / «¿Eliminar dominio "{id}"?»

---

## Out of Scope

- Автоматическая миграция данных из существующего `domain-map-<vault>.json` — не реализуется
- Изменение структуры `DomainEntry` — не в этой задаче
