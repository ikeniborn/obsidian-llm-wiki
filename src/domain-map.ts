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
