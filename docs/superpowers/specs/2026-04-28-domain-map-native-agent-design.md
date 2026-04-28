# Domain Map Storage for Native Agent

**Date:** 2026-04-28  
**Status:** Approved

## Problem

When `backend = native-agent`, the plugin has no defined location for `domain-map-<vault>.json`.  
Currently `controller.ts` calls `requireSkillPath()` for both backends — but `settings.cwd` (the Claude Code skill path) is not shown in the native-agent settings UI and is typically unset.  
Result: native-agent users cannot use domains at all.

## Decision

**Подход C:** `nativeAgent.domainMapDir` с вычисляемым дефолтом.

- Add `domainMapDir: string` to `NativeAgentSettings` (default `""`).
- When empty, the runtime derives the path from `app.vault.adapter.getBasePath()`:  
  `<vaultBasePath>/.obsidian/plugins/llm-wiki/`
- When non-empty, use the value as-is (override for power users, e.g. to share with claude-code).
- For `claude-code` backend: nothing changes — path resolves to `join(skillPath, "shared")` as before.

## Changes

### `types.ts`

Add to `NativeAgentSettings`:
```ts
domainMapDir: string; // "" = auto (vault/.obsidian/plugins/llm-wiki/)
```

Default in `DEFAULT_SETTINGS.nativeAgent.domainMapDir = ""`.

### `domain-map.ts`

Change `domainMapPath` signature — first arg is now `dir` (ready-to-use directory), not `skillPath`:

```ts
// before:
export function domainMapPath(skillPath: string, vaultName: string): string {
  return join(skillPath, "shared", `domain-map-${vaultName}.json`);
}

// after:
export function domainMapPath(dir: string, vaultName: string): string {
  return join(dir, `domain-map-${vaultName}.json`);
}
```

`readDomains(dir, vaultName)` and `addDomain(dir, vaultName, ...)` — first arg renamed `dir` accordingly.  
The `"shared/"` subdirectory responsibility moves to the caller (`controller.ts`).

### `controller.ts`

New private helper:

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

Usage:
- `loadDomains()` → `readDomains(this.resolveDomainMapDir(), vaultName)`
- `registerDomain()` → `addDomain(this.resolveDomainMapDir(), vaultName, ...)`
- `buildAgentRunner()` → reads domains via `resolveDomainMapDir()`
- `dispatch()` → `requireSkillPath()` called only when `backend === "claude-code"`

### `settings.ts`

Add one field in the native-agent UI section:

```
"Папка domain-map"
desc: "Где хранить domain-map-<vault>.json. Пусто — авто: <vault>/.obsidian/plugins/llm-wiki/"
placeholder: "(авто)"
```

## Notes

`addDomain` accepts `repoRoot` to auto-create the wiki subfolder on disk. For native-agent, pass `vaultBasePath` as `repoRoot` (same value used for `resolveDomainMapDir` base). Caller already has this via `getBasePath()`.

## Out of Scope

- Native agent reusing Claude Code skill markdown files as system prompts — deferred to future task.
- Migrating existing domain-map files from `skillPath/shared/` to new location — manual if needed.
