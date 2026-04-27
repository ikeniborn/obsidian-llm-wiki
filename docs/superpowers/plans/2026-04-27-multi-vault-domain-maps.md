# Multi-Vault Domain Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разделить карты доменов по волтам (`domain-map-<vaultName>.json`), автосоздавать файл при первом добавлении домена, предзаполнять `source_paths` из `wiki_folder`, убрать хардкод доменов из модалок.

**Architecture:** Имя волта берётся из `app.vault.getName()` в контроллере и передаётся в функции `domain-map.ts`. Сигнатуры `domainMapPath` / `readDomains` / `addDomain` получают параметр `vaultName`. `DomainModal` принимает список доменов снаружи. `WikiDomain` становится `string`.

**Tech Stack:** TypeScript, Vitest, Node.js `fs` / `os`, Obsidian Plugin API (мок в `vitest.mock.ts`).

---

## File Map

| Файл | Действие | Что меняется |
|------|----------|--------------|
| `src/domain-map.ts` | Modify | `domainMapPath` + `readDomains` + `addDomain` получают `vaultName`; auto-create |
| `src/types.ts` | Modify | `WikiDomain = string` вместо union |
| `src/modals.ts` | Modify | `DomainModal` — динамический список; `AddDomainModal` — sync source_paths; новая `defaultSourcePaths()` |
| `src/controller.ts` | Modify | Передаёт `app.vault.getName()` в domain-map функции |
| `src/main.ts` | Modify | Передаёт `loadDomains()` в `DomainModal` |
| `tests/domain-map.test.ts` | Create | Тесты vault-specific path, auto-create, addDomain |
| `tests/modals.test.ts` | Create | Тест `defaultSourcePaths()` |

---

## Task 1: domain-map.ts — vault-specific path + auto-create

**Files:**
- Modify: `src/domain-map.ts`
- Create: `tests/domain-map.test.ts`

- [ ] **Step 1: Написать failing тесты**

Создать `tests/domain-map.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { domainMapPath, readDomains, addDomain } from "../src/domain-map";

let skillPath: string;

beforeEach(() => {
  skillPath = join(tmpdir(), `llm-wiki-test-${Date.now()}`);
  mkdirSync(join(skillPath, "shared"), { recursive: true });
});

afterEach(() => {
  rmSync(skillPath, { recursive: true, force: true });
});

describe("domainMapPath", () => {
  it("includes vault name in filename", () => {
    const p = domainMapPath(skillPath, "Family");
    expect(p).toBe(join(skillPath, "shared", "domain-map-Family.json"));
  });

  it("uses exact vault name", () => {
    expect(domainMapPath(skillPath, "Work")).toContain("domain-map-Work.json");
  });
});

describe("readDomains", () => {
  it("returns empty array when vault file does not exist", () => {
    expect(readDomains(skillPath, "Family")).toEqual([]);
  });

  it("reads domains from vault-specific file", () => {
    const p = join(skillPath, "shared", "domain-map-Work.json");
    writeFileSync(p, JSON.stringify({
      vault: "Work",
      wiki_root: "vaults/Work/!Wiki",
      domains: [{ id: "ии", name: "ИИ", wiki_folder: "vaults/Work/!Wiki/ии" }],
    }), "utf-8");
    const domains = readDomains(skillPath, "Work");
    expect(domains).toHaveLength(1);
    expect(domains[0].id).toBe("ии");
  });
});

describe("addDomain", () => {
  it("creates vault-specific file if it does not exist", () => {
    const r = addDomain(skillPath, "Family", "", {
      id: "рецепты", name: "Рецепты", wikiFolder: "vaults/Family/!Wiki/рецепты", sourcePaths: [],
    });
    expect(r.ok).toBe(true);
    const p = join(skillPath, "shared", "domain-map-Family.json");
    expect(existsSync(p)).toBe(true);
    const data = JSON.parse(readFileSync(p, "utf-8"));
    expect(data.vault).toBe("Family");
    expect(data.wiki_root).toBe("vaults/Family/!Wiki");
    expect(data.domains[0].id).toBe("рецепты");
  });

  it("appends to existing vault file", () => {
    // first domain creates file
    addDomain(skillPath, "Work", "", {
      id: "ии", name: "ИИ", wikiFolder: "vaults/Work/!Wiki/ии", sourcePaths: [],
    });
    // second domain appends
    const r = addDomain(skillPath, "Work", "", {
      id: "проекты", name: "Проекты", wikiFolder: "vaults/Work/!Wiki/проекты", sourcePaths: [],
    });
    expect(r.ok).toBe(true);
    const p = join(skillPath, "shared", "domain-map-Work.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    expect(data.domains).toHaveLength(2);
  });

  it("returns error for duplicate domain id", () => {
    addDomain(skillPath, "Work", "", {
      id: "ии", name: "ИИ", wikiFolder: "vaults/Work/!Wiki/ии", sourcePaths: [],
    });
    const r = addDomain(skillPath, "Work", "", {
      id: "ии", name: "ИИ дубль", wikiFolder: "vaults/Work/!Wiki/ии", sourcePaths: [],
    });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toMatch(/уже существует/i);
  });
});
```

Добавить `import { writeFileSync } from "node:fs";` в блок импортов выше (он нужен для setup теста readDomains).

- [ ] **Step 2: Запустить тесты — убедиться что падают**

```bash
npx vitest run tests/domain-map.test.ts
```

Ожидаемо: ошибки компиляции или FAIL (функции с другими сигнатурами).

- [ ] **Step 3: Обновить `src/domain-map.ts`**

Заменить весь файл:

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface DomainEntry {
  id: string;
  name: string;
  wiki_folder: string;
  source_paths?: string[];
}

interface DomainMapFile {
  vault?: string;
  wiki_root?: string;
  domains: Array<DomainEntry & {
    entity_types?: unknown[];
    tags?: string[];
    language_notes?: string;
  }>;
  [key: string]: unknown;
}

/** skillPath — полный путь к папке навыка; vaultName — имя волта из app.vault.getName(). */
export function domainMapPath(skillPath: string, vaultName: string): string {
  return join(skillPath, "shared", `domain-map-${vaultName}.json`);
}

export function readDomains(skillPath: string, vaultName: string): DomainEntry[] {
  const p = domainMapPath(skillPath, vaultName);
  if (!existsSync(p)) return [];
  try {
    const data = JSON.parse(readFileSync(p, "utf-8")) as DomainMapFile;
    return (data.domains ?? []).map((d) => ({
      id: d.id,
      name: d.name ?? d.id,
      wiki_folder: d.wiki_folder ?? "",
      source_paths: d.source_paths ?? [],
    }));
  } catch {
    return [];
  }
}

export interface AddDomainInput {
  id: string;
  name: string;
  wikiFolder: string;
  sourcePaths: string[];
}

/**
 * Добавляет запись в domain-map-<vaultName>.json.
 * Создаёт файл если не существует.
 */
export function addDomain(
  skillPath: string,
  vaultName: string,
  repoRoot: string,
  input: AddDomainInput,
): { ok: true } | { ok: false; error: string } {
  const id = input.id.trim();
  if (!id) return { ok: false, error: "ID домена пуст" };
  if (!/^[\p{L}\p{N}_\-]+$/u.test(id)) return { ok: false, error: "ID допускает только буквы/цифры/_/-" };

  const p = domainMapPath(skillPath, vaultName);
  const sharedDir = join(skillPath, "shared");

  let data: DomainMapFile;
  if (!existsSync(p)) {
    mkdirSync(sharedDir, { recursive: true });
    data = {
      vault: vaultName,
      wiki_root: `vaults/${vaultName}/!Wiki`,
      domains: [],
    };
  } else {
    try {
      data = JSON.parse(readFileSync(p, "utf-8")) as DomainMapFile;
    } catch (err) {
      return { ok: false, error: `Невалидный JSON: ${(err as Error).message}` };
    }
  }

  if (!Array.isArray(data.domains)) data.domains = [];
  if (data.domains.some((d) => d.id === id)) return { ok: false, error: `Домен «${id}» уже существует` };

  const wikiFolderRel = input.wikiFolder.trim() || `${data.wiki_root ?? `vaults/${vaultName}/!Wiki`}/${id}`;
  data.domains.push({
    id,
    name: input.name.trim() || id,
    wiki_folder: wikiFolderRel,
    source_paths: input.sourcePaths.map((s) => s.trim()).filter(Boolean),
    entity_types: [],
    tags: [],
    language_notes: "",
  });

  try {
    writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } catch (err) {
    return { ok: false, error: `Запись JSON: ${(err as Error).message}` };
  }

  if (repoRoot) {
    try {
      mkdirSync(join(repoRoot, wikiFolderRel), { recursive: true });
    } catch {
      // не критично
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Запустить тесты — убедиться что проходят**

```bash
npx vitest run tests/domain-map.test.ts
```

Ожидаемо: все тесты PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/domain-map.ts tests/domain-map.test.ts
git commit -m "feat(domain-map): vault-specific files + auto-create"
```

---

## Task 2: types.ts — WikiDomain как string

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Заменить union на string**

В `src/types.ts` строка 8 заменить:

```typescript
// было:
export type WikiDomain = "ии" | "ростелеком" | "базы-данных";

// стало:
export type WikiDomain = string;
```

- [ ] **Step 2: Проверить сборку**

```bash
npm run build 2>&1 | head -30
```

Ожидаемо: сборка проходит без ошибок (или ошибки только из-за ещё не изменённых файлов — будут исправлены в следующих задачах).

- [ ] **Step 3: Коммит**

```bash
git add src/types.ts
git commit -m "refactor(types): WikiDomain = string"
```

---

## Task 3: modals.ts — динамический DomainModal + sync source_paths

**Files:**
- Modify: `src/modals.ts`
- Create: `tests/modals.test.ts`

- [ ] **Step 1: Написать failing тест для `defaultSourcePaths`**

Создать `tests/modals.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { defaultSourcePaths } from "../src/modals";

describe("defaultSourcePaths", () => {
  it("returns wiki_folder wrapped in array", () => {
    expect(defaultSourcePaths("vaults/Work/!Wiki/ии")).toEqual(["vaults/Work/!Wiki/ии"]);
  });

  it("returns empty array for empty string", () => {
    expect(defaultSourcePaths("")).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
npx vitest run tests/modals.test.ts
```

Ожидаемо: ошибка компиляции (функция не экспортирована).

- [ ] **Step 3: Обновить `src/modals.ts`**

Заменить весь файл:

```typescript
import { App, Modal, Setting } from "obsidian";
import type { AddDomainInput, DomainEntry } from "./domain-map";

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private lines: string[],
    private onConfirm: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    for (const line of this.lines) {
      contentEl.createEl("p", { text: line });
    }
    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Отмена").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("▶ Запустить").setCta().onClick(() => {
        this.close();
        this.onConfirm();
      }));
  }
  onClose(): void { this.contentEl.empty(); }
}

export class QueryModal extends Modal {
  private question = "";
  constructor(app: App, private save: boolean, private onSubmit: (q: string) => void) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.save ? "Query + сохранить" : "Query" });
    const ta = contentEl.createEl("textarea", {
      attr: { rows: "5", style: "width:100%;" },
      placeholder: "Сформулируйте вопрос…",
    });
    ta.addEventListener("input", () => { this.question = ta.value; });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Запустить").setCta().onClick(() => {
        const q = this.question.trim();
        if (!q) return;
        this.close();
        this.onSubmit(q);
      }),
    );
    setTimeout(() => ta.focus(), 0);
  }
  onClose(): void { this.contentEl.empty(); }
}

export class DomainModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private allowAll: boolean,
    private extra: { dryRun?: boolean } | null,
    private domains: DomainEntry[],
    private onSubmit: (domain: string | "all", flags: { dryRun?: boolean }) => void,
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    let domain: string | "all" = this.allowAll ? "all" : (this.domains[0]?.id ?? "");
    let dryRun = false;

    if (this.domains.length === 0) {
      new Setting(contentEl)
        .setName("Домен")
        .setDesc("Домены не найдены. Создайте домен через «Добавить домен».")
        .addText((t) => t.setPlaceholder("id домена").onChange((v) => { domain = v.trim(); }));
    } else {
      new Setting(contentEl)
        .setName("Домен")
        .addDropdown((d) => {
          if (this.allowAll) d.addOption("all", "(вся вики)");
          for (const entry of this.domains) {
            d.addOption(entry.id, entry.name || entry.id);
          }
          d.setValue(domain);
          d.onChange((v) => { domain = v; });
        });
    }

    if (this.extra && "dryRun" in this.extra) {
      new Setting(contentEl)
        .setName("--dry-run")
        .addToggle((t) => t.onChange((v) => { dryRun = v; }));
    }
    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Запустить").setCta().onClick(() => {
        this.close();
        this.onSubmit(domain, { dryRun });
      }),
    );
  }
  onClose(): void { this.contentEl.empty(); }
}

/** Дефолтный source_paths для нового домена — папка wiki_folder. */
export function defaultSourcePaths(wikiFolder: string): string[] {
  return wikiFolder ? [wikiFolder] : [];
}

export class AddDomainModal extends Modal {
  private input: AddDomainInput = { id: "", name: "", wikiFolder: "", sourcePaths: [] };
  private wikiFolderInput: { setValue: (v: string) => void } | null = null;
  private sourcePathsInput: { setValue: (v: string) => void } | null = null;
  private sourcePathsTouched = false;

  constructor(
    app: App,
    private wikiRoot: string,
    private onSubmit: (input: AddDomainInput) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Добавить домен" });

    new Setting(contentEl)
      .setName("ID")
      .setDesc("Буквы (включая кириллицу), цифры, дефис, подчёркивание. Используется как имя папки.")
      .addText((t) =>
        t.setPlaceholder("например: проекты").onChange((v) => {
          this.input.id = v.trim();
          if (this.wikiFolderInput && !this.input.wikiFolder) {
            const auto = `${this.wikiRoot}/${this.input.id}`;
            this.wikiFolderInput.setValue(auto);
            if (!this.sourcePathsTouched && this.sourcePathsInput) {
              this.sourcePathsInput.setValue(auto);
              this.input.sourcePaths = defaultSourcePaths(auto);
            }
          }
        }),
      );

    new Setting(contentEl)
      .setName("Отображаемое имя")
      .addText((t) => t.setPlaceholder("Проекты").onChange((v) => { this.input.name = v.trim(); }));

    new Setting(contentEl)
      .setName("Wiki folder")
      .setDesc(`Путь относительно cwd. Пусто = ${this.wikiRoot}/<id>.`)
      .addText((t) => {
        t.setPlaceholder(`${this.wikiRoot}/<id>`).onChange((v) => {
          this.input.wikiFolder = v.trim();
          if (!this.sourcePathsTouched && this.sourcePathsInput) {
            this.sourcePathsInput.setValue(v.trim());
            this.input.sourcePaths = defaultSourcePaths(v.trim());
          }
        });
        this.wikiFolderInput = t;
      });

    new Setting(contentEl)
      .setName("Source paths")
      .setDesc("Список через запятую. По умолчанию совпадает с wiki folder.")
      .addText((t) => {
        t.setPlaceholder("vaults/Work/Проекты/").onChange((v) => {
          this.sourcePathsTouched = true;
          this.input.sourcePaths = v.split(",").map((s) => s.trim()).filter(Boolean);
        });
        this.sourcePathsInput = t;
      });

    contentEl.createEl("p", {
      text: "Запись добавится в domain-map-<vault>.json с пустыми entity_types. Для полноценного ingest позже отредактируйте JSON и добавьте entity_types/extraction_cues.",
      cls: "muted",
    });

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Добавить").setCta().onClick(() => {
        if (!this.input.id) return;
        this.close();
        this.onSubmit(this.input);
      }),
    );
  }

  onClose(): void { this.contentEl.empty(); }
}
```

- [ ] **Step 4: Запустить тесты**

```bash
npx vitest run tests/modals.test.ts
```

Ожидаемо: оба теста PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/modals.ts tests/modals.test.ts
git commit -m "feat(modals): dynamic DomainModal + source_paths auto-fill"
```

---

## Task 4: controller.ts — передать vault name

**Files:**
- Modify: `src/controller.ts`

- [ ] **Step 1: Обновить `loadDomains` и `registerDomain`**

В `src/controller.ts` заменить два метода:

```typescript
/** Список доменов из domain-map-<vault>.json. Пустой массив, если путь к навыку не задан. */
loadDomains(): DomainEntry[] {
  const sp = resolveSkillPath(this.plugin.settings);
  if (!sp) return [];
  return readDomains(sp, this.app.vault.getName());
}

registerDomain(input: AddDomainInput): { ok: true } | { ok: false; error: string } {
  const sp = this.requireSkillPath();
  if (!sp) return { ok: false, error: "путь к навыку не задан" };
  const repoRoot = resolveCwd(this.plugin.settings) ?? "";
  const r = addDomain(sp, this.app.vault.getName(), repoRoot, input);
  if (r.ok) new Notice(`Домен «${input.id}» добавлен`);
  else new Notice(`Не удалось добавить домен: ${r.error}`);
  return r;
}
```

- [ ] **Step 2: Проверить сборку**

```bash
npm run build 2>&1 | head -30
```

Ожидаемо: TypeScript компилируется без ошибок (если main.ts ещё не обновлён — будут ошибки на DomainModal, исправим в следующей задаче).

- [ ] **Step 3: Коммит**

```bash
git add src/controller.ts
git commit -m "feat(controller): pass vault name to domain-map functions"
```

---

## Task 5: main.ts — передать domains в DomainModal

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Обновить lint и init команды**

В `src/main.ts` заменить две команды:

```typescript
this.addCommand({
  id: "lint",
  name: "Lint домена",
  callback: () => {
    const domains = this.controller.loadDomains();
    new DomainModal(this.app, "Lint", true, null, domains,
      (d) => void this.controller.lint(d)).open();
  },
});

this.addCommand({
  id: "init",
  name: "Init домена",
  callback: () => {
    const domains = this.controller.loadDomains();
    new DomainModal(this.app, "Init", false, { dryRun: true }, domains,
      (d, f) => void this.controller.init(d as string, f.dryRun ?? false)).open();
  },
});
```

- [ ] **Step 2: Полная сборка**

```bash
npm run build 2>&1
```

Ожидаемо: сборка без ошибок, `main.js` обновлён.

- [ ] **Step 3: Запустить все тесты**

```bash
npm test
```

Ожидаемо: все тесты PASS (domain-map, modals, stream, prompt).

- [ ] **Step 4: Финальный коммит**

```bash
git add src/main.ts
git commit -m "feat(main): pass domains list to DomainModal"
```

---

## Проверка успеха

После выполнения всех задач:

1. `domain-map-Family.json` создаётся автоматически при первом `registerDomain` в Family vault
2. `domain-map-Work.json` создаётся независимо в Work vault
3. В `AddDomainModal` поле `source_paths` предзаполнено из `wiki_folder`
4. `DomainModal` показывает домены из vault-специфичного файла, без хардкода трёх значений
5. `npm test` — все тесты PASS
6. `npm run build` — сборка без ошибок
