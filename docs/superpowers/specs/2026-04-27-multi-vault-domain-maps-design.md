# Design: Multi-Vault Domain Maps

**Date:** 2026-04-27  
**Status:** Approved

## Problem

1. При создании домена и lint возникают ошибки «source path не указан».
2. Все волты разделяют один `shared/domain-map.json` — домены Work и Family смешиваются в одну карту.
3. `WikiDomain` и `DomainModal` хардкодят три конкретных домена; добавление нового требует правки кода.

## Solution: Approach A — Minimal Changes

### 1. Vault-specific domain map files

Каждый волт получает отдельный файл по маске:

```
shared/domain-map-<vaultName>.json
```

Имя волта берётся из `app.vault.getName()` в момент запуска операции. Пользователь ничего не настраивает.

```
shared/
  domain-map-Family.json
  domain-map-Work.json
```

**Auto-create:** если файл для волта не существует, `addDomain` создаёт его с минимальной структурой перед добавлением домена:

```json
{
  "vault": "<vaultName>",
  "wiki_root": "vaults/<vaultName>/!Wiki",
  "domains": []
}
```

Навык `llm-wiki` определяет нужный файл по той же маске через `cwd` — изменений в аргументах команды нет (вариант B из обсуждения).

### 2. Source paths default

При создании домена поле `source_paths` автоматически заполняется значением `wiki_folder`. Пользователь может изменить вручную.

Флаг `sourcePathsTouched: boolean` в `AddDomainModal` — пока не тронуто вручную, синхронизируется с `wiki_folder`.

Пример: ID `проекты` → `wiki_folder = vaults/Work/!Wiki/проекты` → `source_paths = ["vaults/Work/!Wiki/проекты"]`.

### 3. Dynamic domain list in modals

- `WikiDomain` (`types.ts`) меняется с `"ии" | "ростелеком" | "базы-данных"` на `string`.
- `DomainModal` принимает `domains: DomainEntry[]` — список загружается через `controller.loadDomains()` при открытии.
- Если `domains` пустой — показывает текстовый input с подсказкой «создайте домен через "Добавить домен"».

## Changed Files

| Файл | Изменение |
|------|-----------|
| `src/domain-map.ts` | `domainMapPath(skillPath, vaultName)`, auto-create пустого файла в `addDomain` |
| `src/types.ts` | `WikiDomain = string` |
| `src/controller.ts` | передаёт `app.vault.getName()` во все вызовы domain-map функций; передаёт `loadDomains()` в `DomainModal` |
| `src/modals.ts` | `DomainModal` принимает `domains: DomainEntry[]`; `AddDomainModal` синхронизирует `source_paths` с `wiki_folder` |
| `src/main.ts` | обновляет вызовы `DomainModal` (передача доменов) |

**Не меняются:** `settings.ts`, `runner.ts`, `stream.ts`, `prompt.ts`, `view.ts`.

## Success Criteria

1. Создание домена в Family vault → файл `domain-map-Family.json` создаётся автоматически.
2. Lint в Work vault читает `domain-map-Work.json`, не затрагивает Family.
3. `AddDomainModal` предзаполняет `source_paths` из `wiki_folder`.
4. `DomainModal` показывает домены из vault-специфичного файла, без хардкода.
5. Тесты: `domain-map.ts` — auto-create, vault-specific path; `modals.ts` — source_paths sync.
