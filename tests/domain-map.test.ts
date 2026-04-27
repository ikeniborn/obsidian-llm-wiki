import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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

  it("does not read another vault's file", () => {
    const p = join(skillPath, "shared", "domain-map-Work.json");
    writeFileSync(p, JSON.stringify({
      vault: "Work",
      wiki_root: "vaults/Work/!Wiki",
      domains: [{ id: "ии", name: "ИИ", wiki_folder: "vaults/Work/!Wiki/ии" }],
    }), "utf-8");
    expect(readDomains(skillPath, "Family")).toEqual([]);
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
    addDomain(skillPath, "Work", "", {
      id: "ии", name: "ИИ", wikiFolder: "vaults/Work/!Wiki/ии", sourcePaths: [],
    });
    const r = addDomain(skillPath, "Work", "", {
      id: "проекты", name: "Проекты", wikiFolder: "vaults/Work/!Wiki/проекты", sourcePaths: [],
    });
    expect(r.ok).toBe(true);
    const p = join(skillPath, "shared", "domain-map-Work.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    expect(data.domains).toHaveLength(2);
  });

  it("keeps vaults isolated — Work domains not in Family file", () => {
    addDomain(skillPath, "Work", "", {
      id: "ии", name: "ИИ", wikiFolder: "vaults/Work/!Wiki/ии", sourcePaths: [],
    });
    addDomain(skillPath, "Family", "", {
      id: "рецепты", name: "Рецепты", wikiFolder: "vaults/Family/!Wiki/рецепты", sourcePaths: [],
    });
    expect(readDomains(skillPath, "Work").map((d) => d.id)).toEqual(["ии"]);
    expect(readDomains(skillPath, "Family").map((d) => d.id)).toEqual(["рецепты"]);
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

  it("rejects invalid id characters", () => {
    const r = addDomain(skillPath, "Work", "", {
      id: "bad/slash", name: "x", wikiFolder: "", sourcePaths: [],
    });
    expect(r.ok).toBe(false);
  });

  it("auto-fills wiki_folder when empty using vault wiki_root", () => {
    addDomain(skillPath, "Work", "", {
      id: "новый", name: "Новый", wikiFolder: "", sourcePaths: [],
    });
    const data = JSON.parse(readFileSync(join(skillPath, "shared", "domain-map-Work.json"), "utf-8"));
    const added = data.domains.find((d: { id: string }) => d.id === "новый");
    expect(added.wiki_folder).toBe("vaults/Work/!Wiki/новый");
  });
});
