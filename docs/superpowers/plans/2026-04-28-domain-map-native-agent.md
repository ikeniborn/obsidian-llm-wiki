# Domain Map Native Agent Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native-agent backend stores `domain-map-<vault>.json` inside the vault's `.obsidian/plugins/llm-wiki/` by default, with a user-configurable override, without touching Claude Code backend behaviour.

**Architecture:** Add `domainMapDir` to `NativeAgentSettings`. Introduce `resolveDomainMapDir()` in `controller.ts` that returns the correct directory per backend. Change `domain-map.ts` functions to take a ready-to-use `dir` instead of `skillPath` (the `"shared/"` nesting moves to the caller). Remove `requireSkillPath()` guard from `dispatch()` for native-agent.

**Tech Stack:** TypeScript, Obsidian plugin API, Vitest

---

## File Map

| File | Action |
|---|---|
| `src/types.ts` | Add `domainMapDir: string` to `NativeAgentSettings`; add default in `DEFAULT_SETTINGS` |
| `src/domain-map.ts` | Rename first arg of `domainMapPath`, `readDomains`, `addDomain` from `skillPath` to `dir`; remove `"shared/"` from `domainMapPath` |
| `src/controller.ts` | Add `resolveDomainMapDir()`; update `loadDomains`, `registerDomain`, `buildAgentRunner`, `dispatch` |
| `src/settings.ts` | Add "Папка domain-map" field in native-agent UI section |
| `tests/domain-map.test.ts` | Update all call sites to pass `dir` directly (no more `skillPath + "shared"`) |

---

### Task 1: Update `domain-map.ts` signature

**Files:**
- Modify: `src/domain-map.ts`
- Test: `tests/domain-map.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `tests/domain-map.test.ts` content. The key change: tests now create a plain temp dir and pass it directly as `dir`; no more `"shared"` subdir.

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { domainMapPath, readDomains, addDomain } from "../src/domain-map";

let dir: string;

beforeEach(() => {
  dir = join(tmpdir(), `llm-wiki-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("domainMapPath", () => {
  it("includes vault name in filename", () => {
    const p = domainMapPath(dir, "Family");
    expect(p).toBe(join(dir, "domain-map-Family.json"));
  });

  it("uses exact vault name", () => {
    expect(domainMapPath(dir, "Work")).toContain("domain-map-Work.json");
  });
});

describe("readDomains", () => {
  it("returns empty array when vault file does not exist", () => {
    expect(readDomains(dir, "Family")).toEqual([]);
  });

  it("reads domains from vault-specific file", () => {
    const p = join(dir, "domain-map-Work.json");
    writeFileSync(p, JSON.stringify({
      vault: "Work",
      wiki_root: "vaults/Work/!Wiki",
      domains: [{ id: "ии", name: "ИИ", wiki_folder: "vaults/Work/!Wiki/ии" }],
    }), "utf-8");
    const domains = readDomains(dir, "Work");
    expect(domains).toHaveLength(1);
    expect(domains[0].id).toBe("ии");
  });

  it("does not read another vault's file", () => {
    const p = join(dir, "domain-map-Work.json");
    writeFileSync(p, JSON.stringify({
      vault: "Work",
      wiki_root: "vaults/Work/!Wiki",
      domains: [{ id: "ии", name: "ИИ", wiki_folder: "vaults/Work/!Wiki/ии" }],
    }), "utf-8");
    expect(readDomains(dir, "Family")).toEqual([]);
  });
});

describe("addDomain", () => {
  it("creates vault-specific file if it does not exist", () => {
    const r = addDomain(dir, "Family", "", {
      id: "рецепты", name: "Рецепты", wikiFolder: "vaults/Family/!Wiki/рецепты", sourcePaths: [],
    });
    expect(r.ok).toBe(true);
    const p = join(dir, "domain-map-Family.json");
    expect(existsSync(p)).toBe(true);
    const data = JSON.parse(readFileSync(p, "utf-8"));
    expect(data.vault).toBe("Family");
    expect(data.wiki_root).toBe("vaults/Family/!Wiki");
    expect(data.domains[0].id).toBe("рецепты");
  });

  it("appends to existing vault file", () => {
    addDomain(dir, "Work", "", {
      id: "ии", name: "ИИ", wikiFolder: "vaults/Work/!Wiki/ии", sourcePaths: [],
    });
    const r = addDomain(dir, "Work", "", {
      id: "проекты", name: "Проекты", wikiFolder: "vaults/Work/!Wiki/проекты", sourcePaths: [],
    });
    expect(r.ok).toBe(true);
    const data = JSON.parse(readFileSync(join(dir, "domain-map-Work.json"), "utf-8"));
    expect(data.domains).toHaveLength(2);
  });

  it("keeps vaults isolated — Work domains not in Family file", () => {
    addDomain(dir, "Work", "", {
      id: "ии", name: "ИИ", wikiFolder: "vaults/Work/!Wiki/ии", sourcePaths: [],
    });
    addDomain(dir, "Family", "", {
      id: "рецепты", name: "Рецепты", wikiFolder: "vaults/Family/!Wiki/рецепты", sourcePaths: [],
    });
    expect(readDomains(dir, "Work").map((d) => d.id)).toEqual(["ии"]);
    expect(readDomains(dir, "Family").map((d) => d.id)).toEqual(["рецепты"]);
  });

  it("returns error for duplicate domain id", () => {
    addDomain(dir, "Work", "", {
      id: "ии", name: "ИИ", wikiFolder: "vaults/Work/!Wiki/ии", sourcePaths: [],
    });
    const r = addDomain(dir, "Work", "", {
      id: "ии", name: "ИИ дубль", wikiFolder: "vaults/Work/!Wiki/ии", sourcePaths: [],
    });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toMatch(/уже существует/i);
  });

  it("rejects invalid id characters", () => {
    const r = addDomain(dir, "Work", "", {
      id: "bad/slash", name: "x", wikiFolder: "", sourcePaths: [],
    });
    expect(r.ok).toBe(false);
  });

  it("auto-fills wiki_folder when empty using vault wiki_root", () => {
    addDomain(dir, "Work", "", {
      id: "новый", name: "Новый", wikiFolder: "", sourcePaths: [],
    });
    const data = JSON.parse(readFileSync(join(dir, "domain-map-Work.json"), "utf-8"));
    const added = data.domains.find((d: { id: string }) => d.id === "новый");
    expect(added.wiki_folder).toBe("vaults/Work/!Wiki/новый");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/domain-map.test.ts
```

Expected: FAIL — `domainMapPath` still uses old signature with `"shared/"`.

- [ ] **Step 3: Update `src/domain-map.ts`**

Change `domainMapPath` — remove `"shared/"` nesting, rename first arg to `dir`:

```ts
/** dir — готовая директория хранения (без вложенного shared/). */
export function domainMapPath(dir: string, vaultName: string): string {
  return join(dir, `domain-map-${vaultName}.json`);
}
```

Change `readDomains` first arg from `skillPath` to `dir`:

```ts
export function readDomains(dir: string, vaultName: string): DomainEntry[] {
  const p = domainMapPath(dir, vaultName);
  if (!existsSync(p)) return [];
  try {
    const data = JSON.parse(readFileSync(p, "utf-8")) as DomainMapFile;
    return (data.domains ?? []).map((d) => ({
      id: d.id,
      name: d.name ?? d.id,
      wiki_folder: d.wiki_folder ?? "",
      source_paths: d.source_paths ?? [],
      entity_types: d.entity_types ?? [],
      language_notes: d.language_notes ?? "",
    }));
  } catch {
    return [];
  }
}
```

Change `addDomain` first arg from `skillPath` to `dir`; update body — no longer constructs `sharedDir`, uses `dir` directly:

```ts
export function addDomain(
  dir: string,
  vaultName: string,
  repoRoot: string,
  input: AddDomainInput,
): { ok: true } | { ok: false; error: string } {
  const id = input.id.trim();
  if (!id) return { ok: false, error: "ID домена пуст" };
  if (!/^[\p{L}\p{N}_\-]+$/u.test(id)) return { ok: false, error: "ID допускает только буквы/цифры/_/-" };

  const p = domainMapPath(dir, vaultName);

  let data: DomainMapFile;
  if (!existsSync(p)) {
    mkdirSync(dir, { recursive: true });
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/domain-map.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain-map.ts tests/domain-map.test.ts
git commit -m "refactor: domain-map functions take dir instead of skillPath"
```

---

### Task 2: Add `domainMapDir` to settings types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add field to `NativeAgentSettings` interface**

In `src/types.ts`, add `domainMapDir` to the `nativeAgent` object inside `LlmWikiPluginSettings`:

```ts
  nativeAgent: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    requestTimeoutSec: number;
    topP: number | null;
    systemPrompt: string;
    numCtx: number | null;
    domainMapDir: string; // "" = авто: <vault>/.obsidian/plugins/llm-wiki/
  };
```

- [ ] **Step 2: Add default in `DEFAULT_SETTINGS`**

In `src/types.ts`, inside `DEFAULT_SETTINGS.nativeAgent`, add:

```ts
    domainMapDir: "",
```

- [ ] **Step 3: Run full test suite to verify no regressions**

```bash
npm test
```

Expected: all PASS (TypeScript compiler and tests).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: add domainMapDir to NativeAgentSettings"
```

---

### Task 3: Add `resolveDomainMapDir()` and update `controller.ts`

**Files:**
- Modify: `src/controller.ts`

- [ ] **Step 1: Add `resolveDomainMapDir()` private method**

In `src/controller.ts`, add the method to `WikiController` (place it near `requireSkillPath`):

```ts
private resolveDomainMapDir(): string {
  const s = this.plugin.settings;
  if (s.backend === "native-agent") {
    if (s.nativeAgent.domainMapDir) return s.nativeAgent.domainMapDir;
    const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    return join(base, ".obsidian", "plugins", "llm-wiki");
  }
  return join(resolveSkillPath(s) ?? "", "shared");
}
```

- [ ] **Step 2: Update `loadDomains()`**

Replace the body of `loadDomains()`:

```ts
loadDomains(): DomainEntry[] {
  if (this.plugin.settings.backend === "claude-code") {
    const sp = resolveSkillPath(this.plugin.settings);
    if (!sp) return [];
  }
  return readDomains(this.resolveDomainMapDir(), this.app.vault.getName());
}
```

- [ ] **Step 3: Update `registerDomain()`**

Replace the body of `registerDomain()`:

```ts
registerDomain(input: AddDomainInput): { ok: true } | { ok: false; error: string } {
  if (this.plugin.settings.backend === "claude-code") {
    const sp = this.requireSkillPath();
    if (!sp) return { ok: false, error: "путь к навыку не задан" };
  }
  const vaultName = this.app.vault.getName();
  const vaultBase = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
  const repoRoot = this.plugin.settings.backend === "native-agent"
    ? vaultBase
    : (resolveCwd(this.plugin.settings) ?? "");
  const r = addDomain(this.resolveDomainMapDir(), vaultName, repoRoot, input);
  if (r.ok) new Notice(`Домен «${input.id}» добавлен`);
  else new Notice(`Не удалось добавить домен: ${r.error}`);
  return r;
}
```

- [ ] **Step 4: Update `buildAgentRunner()`**

Replace the `domains` read line inside `buildAgentRunner()`:

```ts
private buildAgentRunner(): AgentRunner | null {
  const adapter = this.app.vault.adapter as unknown as VaultAdapter;
  const basePath = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
  const vaultTools = new VaultTools(adapter, basePath);
  const vaultName = this.app.vault.getName();
  const domains = readDomains(this.resolveDomainMapDir(), vaultName);

  return new AgentRunner(this.plugin.settings, vaultTools, vaultName, domains);
}
```

(Remove the `const skillPath = resolveSkillPath(...)` line and the `if (!skillPath)` guard that were there before.)

- [ ] **Step 5: Fix `dispatch()` — remove `requireSkillPath` for native-agent**

In `dispatch()`, the current code (around line 131) is:
```ts
if (!this.requireSkillPath()) return;
```

Replace with:
```ts
if (this.plugin.settings.backend === "claude-code" && !this.requireSkillPath()) return;
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/controller.ts
git commit -m "feat: route domain-map storage by backend; native-agent uses vault plugin dir"
```

---

### Task 4: Add "Папка domain-map" field in settings UI

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Add the setting field in native-agent UI section**

In `src/settings.ts`, inside the `else` branch (native-agent section), add after the "System prompt" textarea setting block and before the closing `}`:

```ts
      new Setting(containerEl)
        .setName("Папка domain-map")
        .setDesc("Где хранить domain-map-<vault>.json. Пусто — авто: <vault>/.obsidian/plugins/llm-wiki/")
        .addText((t) =>
          t
            .setPlaceholder("(авто)")
            .setValue(s.nativeAgent.domainMapDir)
            .onChange(async (v) => {
              s.nativeAgent.domainMapDir = v.trim();
              await this.plugin.saveSettings();
            }),
        );
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 3: Build**

Bump patch version in `package.json` and `manifest.json` before building (per project convention), then:

```bash
npm run build
```

Expected: `dist/main.js` updated, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts package.json manifest.json dist/main.js dist/manifest.json dist/styles.css
git commit -m "feat: add domain-map dir setting to native-agent UI"
```
