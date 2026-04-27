# Интерактивный режим iclaude — дизайн

**Дата:** 2026-04-27  
**Проект:** obsidian-llm-wiki плагин  
**Статус:** approved

## Контекст

Плагин запускает iclaude с `stdio: ["ignore", "pipe", "pipe"]` — stdin закрыт. Это блокирует работу операций скилла llm-wiki которые используют `AskUserQuestion` (например `bootstrap`): iclaude ждёт ответа через stdin, не получает его и зависает.

## Решение

Открыть stdin (`"pipe"`), перехватывать `AskUserQuestion` как новый тип RunEvent, показывать модальное окно Obsidian, писать ответ в stdin в формате `tool_result`.

## Секция 1 — Протокол и типы

**Новый RunEvent в `src/types.ts`:**
```typescript
| { kind: "ask_user"; question: string; options: string[]; toolUseId: string }
```

**`parseStreamLine()` в `src/stream.ts`:**
Когда приходит `tool_use` с `name: "AskUserQuestion"` — возвращать `ask_user` event:
- `question` ← `input.prompt`
- `options` ← `input.options` (массив строк, может быть пустым)
- `toolUseId` ← `id`

**`IclaudeRunner` в `src/runner.ts`:**
- Изменить `stdio[0]` с `"ignore"` на `"pipe"`
- Добавить метод `sendToolResult(toolUseId: string, answer: string)`:
  ```
  пишет в stdin: {"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"<id>","content":"<answer>"}]}}
  ```
- AsyncGenerator приостанавливается на `ask_user` — не вызывает `wake()` пока контроллер не вызовет `sendToolResult` + `resumeStream()`

## Секция 2 — WikiController

**`src/controller.ts`:**

Когда из runner приходит `ask_user`:
1. Вызвать `view.showQuestionModal(question, options)` → возвращает `Promise<string>`
2. `await` ответа пользователя
3. Вызвать `runner.sendToolResult(toolUseId, answer)`
4. Продолжить итерацию генератора

Single-flight guard (`this._running`) остаётся активным пока modal открыт — параллельные операции отклоняются.

**Отмена во время ожидания:**
Если пользователь нажимает «Отменить» — modal закрывается с reject, контроллер посылает SIGTERM процессу.

## Секция 3 — UI: WikiQuestionModal

**Новый класс `WikiQuestionModal extends Modal` в `src/view.ts`:**

`view.showQuestionModal(question, options): Promise<string>` — создаёт и открывает модалку.

**Содержимое:**
- Заголовок: «LLM Wiki — требуется ответ»
- Текст вопроса
- Если `options.length > 0` → кнопки-варианты; клик резолвит Promise текстом варианта
- Если `options` пуст → текстовое поле + кнопка «ОК»; Enter или кнопка резолвит Promise значением поля
- Кнопка «Отменить» → reject Promise

**Рендер в боковой панели:**
Событие `ask_user` в `view.appendEvent()` отображается как строка «⏳ Ожидание ответа…» — пользователь видит что процесс паузирован.

## Файлы и изменения

| Файл | Изменение |
|------|-----------|
| `src/types.ts` | Добавить `ask_user` в union RunEvent |
| `src/stream.ts` | Распознавать `tool_use` name=AskUserQuestion → возвращать `ask_user` |
| `src/runner.ts` | stdin → pipe; добавить `sendToolResult()` + `resumeStream()` |
| `src/controller.ts` | await `view.showQuestionModal()` перед `sendToolResult` |
| `src/view.ts` | Добавить `WikiQuestionModal`; рендер `ask_user` события |

## Тесты

- `tests/stream.test.ts` — добавить тест: `tool_use` с `name: "AskUserQuestion"` → `ask_user` event
- `tests/runner.integration.test.ts` — добавить тест: mock-iclaude выдаёт AskUserQuestion, runner паузируется, `sendToolResult` продолжает выполнение
- `src/view.ts` — `WikiQuestionModal` тестируется вручную (Obsidian Modal API)
