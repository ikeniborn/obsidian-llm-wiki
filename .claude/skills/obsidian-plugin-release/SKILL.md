---
name: obsidian-plugin-release
description: Use when publishing a new version of the obsidian-llm-wiki plugin — creating a GitHub Release with built artifacts after version bump and build.
---

# Obsidian Plugin Release

Публикация новой версии плагина `obsidian-llm-wiki` на GitHub.

## Когда использовать

- Нужно выпустить новую версию плагина (после внесения изменений)
- Нужно создать GitHub Release с артефактами сборки

**НЕ для первичной публикации** в Obsidian Community Plugins (это делается один раз через PR в `obsidianmd/obsidian-releases`).

## Процесс: новая версия

### 1. Поднять версию

Прочитать текущую версию из `package.json`, инкрементировать patch (`X.Y.Z` → `X.Y.(Z+1)`).

```bash
# Прочитать текущую версию
node -p "require('./package.json').version"
```

Обновить оба файла:
- `package.json` → поле `version`
- `manifest.json` → поле `version`

Значения должны совпадать.

### 2. Собрать

```bash
npm run build
```

Артефакты: `dist/main.js`, `dist/manifest.json`, `dist/styles.css`.

### 3. Создать GitHub Release

```bash
gh release create <версия> \
  dist/main.js dist/manifest.json dist/styles.css \
  --title "<версия>"
```

**Правила:**
- Тег и название — без префикса `v` (правильно: `0.2.1`, не `v0.2.1`)
- Тег должен точно совпадать с `version` в `manifest.json`
- Все три файла прикреплять как отдельные файлы (не архив)

Obsidian подхватит новый Release автоматически — PR в `obsidian-releases` не нужен.

## Быстрая проверка перед публикацией

| Проверка | Команда |
|---|---|
| Версия совпадает в обоих файлах | `node -p "require('./package.json').version"` и `node -p "require('./manifest.json').version"` |
| Артефакты собраны | `ls dist/main.js dist/manifest.json dist/styles.css` |
| Тег не существует | `gh release view <версия>` (должна быть ошибка) |

## Первичная публикация (только один раз)

Если плагин ещё не опубликован в Community Plugins — нужен PR в форк `obsidianmd/obsidian-releases`.

### Запись в community-plugins.json

```json
{
  "id": "llm-wiki",
  "name": "LLM Wiki",
  "author": "ikeniborn",
  "description": "AI-powered compoundable knowledge base — extracts, synthesizes and maintains a wiki from raw sources.",
  "repo": "ikeniborn/obsidian-llm-wiki"
}
```

Допустимые ключи только: `id`, `name`, `author`, `description`, `repo`.

### Правила валидации бота

- `id` не содержит `obsidian`, не заканчивается на `plugin`, только `^[a-z0-9-_]+$`
- `description` не содержит `Obsidian`, не начинается с `This plugin`/`This is a plugin`, заканчивается `.?!)`, ≤250 символов
- `description` совпадает с полем в `manifest.json`
- Тело PR содержит точные строки из шаблона (см. ниже)

### Тело PR (точный шаблон)

```markdown
# I am submitting a new Community Plugin

- [x] I attest that I have done my best to deliver a high-quality plugin, am proud of the code I have written, and would recommend it to others. I commit to maintaining the plugin and being responsive to bug reports. If I am no longer able to maintain it, I will make reasonable efforts to find a successor maintainer or withdraw the plugin from the directory.

## Repo URL

Link to my plugin: https://github.com/ikeniborn/obsidian-llm-wiki

## Release Checklist
- [x] I have tested the plugin on
  - [x]  Windows
  - [x]  macOS
  - [x]  Linux
  - [ ]  Android _(if applicable)_
  - [ ]  iOS _(if applicable)_
- [x] My GitHub release contains all required files (as individual files, not just in the source.zip / source.tar.gz)
  - [x] `main.js`
  - [x] `manifest.json`
  - [ ] `styles.css` _(optional)_
- [x] GitHub release name matches the exact version number specified in my manifest.json (_**Note:** Use the exact version number, don't include a prefix `v`_)
- [x] The `id` in my `manifest.json` matches the `id` in the `community-plugins.json` file.
- [x] My README.md describes the plugin's purpose and provides clear usage instructions.
- [x] I have read the developer policies at https://docs.obsidian.md/Developer+policies, and have assessed my plugin's adherence to these policies.
- [x] I have read the tips in https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and have self-reviewed my plugin to avoid these common pitfalls.
- [x] I have added a license in the LICENSE file.
- [x] My project respects and is compatible with the original license of any code from other plugins that I'm using.
      I have given proper attribution to these other projects in my `README.md`.
```

Внимание на апострофы: `plugin's`, `I'm using` — бот ищет точное вхождение подстрок.

### Перезапуск бота

Бот запускается при каждом пуше в ветку PR (только если `additions > deletions`).
Для ручного перезапуска: закрыть и переоткрыть PR.

## Связанные ресурсы

- PR в obsidian-releases: https://github.com/obsidianmd/obsidian-releases/pull/12351
- Текущий Release: https://github.com/ikeniborn/obsidian-llm-wiki/releases
