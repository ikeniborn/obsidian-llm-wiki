# Obsidian LLM Wiki Plugin

Плагин запускает скилл `llm-wiki` через `iclaude`/`claude` и показывает прогресс в side-panel Obsidian.

## Требования

- Obsidian 1.5+
- Установленный `iclaude.sh` (https://github.com/.../iclaude)
- Скилл `llm-wiki` в `<repo>/.claude/skills/llm-wiki/`

## Сборка

```bash
cd plugins/obsidian-llm-wiki
npm install
npm run build
```

Будет создан `main.js`.

## Установка в волт

В каждом волте, где нужен плагин:

```bash
ln -s "$PWD/plugins/obsidian-llm-wiki" \
      "vaults/Work/.obsidian/plugins/obsidian-llm-wiki"
```

В Obsidian: Settings → Community plugins → Installed plugins → включить "LLM Wiki".

## Настройка

В разделе настроек плагина:

- **Путь к iclaude.sh** — обязательно, абсолютный путь
- **Рабочая директория (cwd)** — корень репозитория с `.claude/skills/llm-wiki/`. Пусто = автоопределение.
- **Allowed tools** — `Read,Edit,Write,Glob,Grep` по умолчанию
- **Таймауты** — `ingest/query/lint/init` в секундах через `/`

## Команды

| Команда | Действие |
|---|---|
| `LLM Wiki: Открыть панель` | Открыть side-panel |
| `LLM Wiki: Ingest активного файла` | Добавить текущую заметку в wiki |
| `LLM Wiki: Query` | Задать вопрос (ответ в панели) |
| `LLM Wiki: Query + сохранить` | Сохранить ответ как новую страницу и открыть |
| `LLM Wiki: Lint домена` | Запустить проверки |
| `LLM Wiki: Init домена` | Первичная инициализация (долго!) |
| `LLM Wiki: Отменить операцию` | SIGTERM child process |

## Разработка

```bash
npm run dev    # esbuild watch
npm test       # vitest
```

## Smoke-test чек-лист (после каждой сборки)

1. **Сборка и установка**
   - `npm run build` без ошибок
   - Symlink в `vaults/Work/.obsidian/plugins/`
   - Плагин включён в настройках Obsidian

2. **Settings**
   - Заполнен `iclaudePath`
   - cwd пуст → autodetect находит репо
   - Settings сохраняются после перезагрузки Obsidian

3. **Open panel**
   - Команда `LLM Wiki: Открыть панель` показывает side-panel
   - Список «История» пуст или содержит прошлые запуски

4. **Ingest активного файла**
   - Открыть `vaults/Work/!Daily/<любая>.md`
   - Запустить `LLM Wiki: Ingest активного файла`
   - В панели появляются шаги (`Read`, `Edit`/`Write`)
   - Финальный отчёт виден
   - В git status появились новые/изменённые файлы в `vaults/Work/!Wiki/`

5. **Query inline**
   - Команда `LLM Wiki: Query`, вопрос «Что такое SCD2?»
   - Ответ появляется в панели, WikiLinks кликабельны

6. **Query + save**
   - Тот же вопрос с командой `Query + сохранить`
   - После завершения — Obsidian открыл созданную страницу

7. **Cancel**
   - Запустить ingest, нажать «Отменить» в первые 2с
   - В истории статус `cancelled`, child process завершён (`pgrep claude` пусто)

8. **Lint**
   - `LLM Wiki: Lint домена` → выбрать «вся вики»
   - Отчёт виден в панели

9. **Ошибки**
   - Очистить `iclaudePath` → команда показывает Notice
   - Указать неверный cwd → Notice о .claude/skills/llm-wiki

10. **Race / single-flight**
    - Запустить ingest, не дожидаясь завершения вызвать query → Notice «Уже выполняется»

Записать результаты прогонов с датами; повторять после каждого изменения.
