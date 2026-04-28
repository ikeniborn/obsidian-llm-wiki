import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { RunEvent } from "../types";
import type { VaultTools } from "../vault-tools";

export async function* runIngest(
  args: string[],
  vaultTools: VaultTools,
  llm: OpenAI,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const filePath = args[0];
  if (!filePath) {
    yield { kind: "error", message: "ingest: file path required" };
    return;
  }

  const absSource = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
  const sourceVaultPath = vaultTools.toVaultPath(absSource);
  if (!sourceVaultPath) {
    yield { kind: "error", message: `Source file ${filePath} is outside the vault.` };
    return;
  }

  yield { kind: "tool_use", name: "Read", input: { path: sourceVaultPath } };
  let sourceContent: string;
  try {
    sourceContent = await vaultTools.read(sourceVaultPath);
  } catch (e) {
    yield { kind: "error", message: `Cannot read ${sourceVaultPath}: ${(e as Error).message}` };
    return;
  }
  yield { kind: "tool_result", ok: true, preview: sourceContent.slice(0, 100) };

  const domain = detectDomain(absSource, domains, repoRoot);
  if (!domain) {
    yield { kind: "error", message: "No domain found for this file. Configure domain-map." };
    return;
  }

  const absWiki = isAbsolute(domain.wiki_folder) ? domain.wiki_folder : join(repoRoot, domain.wiki_folder);
  const wikiVaultPath = vaultTools.toVaultPath(absWiki);
  if (!wikiVaultPath) {
    yield { kind: "error", message: `Wiki folder ${domain.wiki_folder} is outside the vault.` };
    return;
  }

  const existingPaths = await vaultTools.listFiles(wikiVaultPath);
  const existingPages = await vaultTools.readAll(existingPaths);

  yield { kind: "assistant_text", delta: `Synthesizing wiki pages for domain "${domain.id}"...\n` };

  const start = Date.now();
  const messages = buildIngestMessages(sourceVaultPath, sourceContent, domain, wikiVaultPath, existingPages);

  let fullText = "";
  try {
    const stream = await llm.chat.completions.create(
      { model, messages, stream: true },
      { signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        yield { kind: "assistant_text", delta };
      }
    }
  } catch (e) {
    if (signal.aborted || (e as Error).name === "AbortError") return;
    const resp = await llm.chat.completions.create({ model, messages, stream: false });
    fullText = resp.choices[0]?.message?.content ?? "";
    if (fullText) yield { kind: "assistant_text", delta: fullText };
  }

  if (signal.aborted) return;

  const pages = parseJsonPages(fullText);
  for (const page of pages) {
    yield { kind: "tool_use", name: "Write", input: { path: page.path } };
    try {
      await vaultTools.write(page.path, page.content);
      yield { kind: "tool_result", ok: true };
    } catch (e) {
      yield { kind: "tool_result", ok: false, preview: (e as Error).message };
    }
  }

  yield {
    kind: "result",
    durationMs: Date.now() - start,
    text: pages.length > 0 ? `Ingested into ${pages.length} wiki page(s).` : "Ingested into 0 wiki page(s).",
  };
}

export function detectDomain(absFilePath: string, domains: DomainEntry[], repoRoot: string): DomainEntry | null {
  for (const d of domains) {
    const matched = d.source_paths?.some((sp) => {
      const abs = isAbsolute(sp) ? sp : join(repoRoot, sp);
      return absFilePath.startsWith(abs);
    });
    if (matched) return d;
  }
  return domains[0] ?? null;
}

export function parseJsonPages(text: string): Array<{ path: string; content: string }> {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is { path: string; content: string } =>
        x !== null &&
        typeof x === "object" &&
        typeof x.path === "string" &&
        typeof x.content === "string",
    );
  } catch {
    return [];
  }
}

function buildIngestMessages(
  sourcePath: string,
  sourceContent: string,
  domain: DomainEntry,
  wikiVaultPath: string,
  existingPages: Map<string, string>,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const existing = existingPages.size > 0
    ? [...existingPages.entries()].map(([p, c]) => `${p}:\n${c.slice(0, 300)}`).join("\n\n")
    : "None yet.";
  return [
    {
      role: "system",
      content:
        `You are a wiki synthesis assistant. Extract key entities from the source and create wiki pages.\n` +
        `Return ONLY a JSON array, no other text:\n` +
        `[{"path":"${wikiVaultPath}/EntityName.md","content":"# EntityName\\n\\ncontent..."}]\n` +
        `Rules: one entity per page; markdown; path must start with "${wikiVaultPath}"; facts from source only.`,
    },
    {
      role: "user",
      content: [
        `Domain: ${domain.id} (${domain.name})`,
        `Wiki folder (vault-relative): ${wikiVaultPath}`,
        "",
        `Source file: ${sourcePath}`,
        sourceContent.slice(0, 8000),
        "",
        `Existing pages:\n${existing}`,
      ].join("\n"),
    },
  ];
}
