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
