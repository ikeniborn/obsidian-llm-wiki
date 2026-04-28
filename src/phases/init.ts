import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { RunEvent } from "../types";
import type { VaultTools } from "../vault-tools";

export async function* runInit(
  args: string[],
  vaultTools: VaultTools,
  llm: OpenAI,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  vaultName: string,
  skillPath: string,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const domainId = args[0];
  const dryRun = args.includes("--dry-run");

  if (!domainId) {
    yield { kind: "error", message: "init: domain id required" };
    return;
  }

  const existing = domains.find((d) => d.id === domainId);
  if (existing) {
    yield { kind: "error", message: `Domain "${domainId}" already exists in domain-map.` };
    return;
  }

  yield { kind: "assistant_text", delta: `Bootstrapping domain "${domainId}"...\n` };

  const start = Date.now();

  // Sample a few vault files to give LLM context
  const allFiles = await vaultTools.listFiles("");
  const sampleFiles = allFiles.slice(0, 5);
  const samples = await vaultTools.readAll(sampleFiles);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        `You are a wiki domain architect. Generate a domain entry for a domain-map.json file.`,
        `Return ONLY valid JSON matching this structure exactly:`,
        `{`,
        `  "id": "${domainId}",`,
        `  "name": "Human-readable name",`,
        `  "wiki_folder": "vaults/${vaultName}/!Wiki/${domainId}",`,
        `  "source_paths": ["relative/source/path"],`,
        `  "entity_types": ["Type1", "Type2"],`,
        `  "language_notes": ""`,
        `}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Domain ID: ${domainId}`,
        `Vault name: ${vaultName}`,
        "",
        `Sample vault files:`,
        [...samples.entries()].map(([p, c]) => `${p}:\n${c.slice(0, 400)}`).join("\n\n"),
      ].join("\n"),
    },
  ];

  let fullText = "";
  try {
    const stream = await llm.chat.completions.create({ model, messages, stream: true }, { signal });
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

  // Parse and validate JSON
  let entry: DomainEntry;
  try {
    const match = fullText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in LLM response");
    entry = JSON.parse(match[0]) as DomainEntry;
    if (!entry.id || !entry.wiki_folder) throw new Error("Missing required fields");
  } catch (e) {
    yield { kind: "error", message: `Failed to parse domain entry: ${(e as Error).message}` };
    return;
  }

  if (dryRun) {
    yield {
      kind: "result",
      durationMs: Date.now() - start,
      text: `Dry run — domain entry:\n\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\``,
    };
    return;
  }

  // Write domain-map via existing addDomain (node:fs)
  const dmPath = `${skillPath}/shared/domain-map-${vaultName}.json`;
  yield { kind: "tool_use", name: "Write", input: { path: dmPath } };

  try {
    const { addDomain } = await import("../domain-map");
    const result = addDomain(skillPath, vaultName, repoRoot, {
      id: entry.id,
      name: entry.name ?? entry.id,
      wikiFolder: entry.wiki_folder,
      sourcePaths: entry.source_paths ?? [],
    });
    if (!result.ok) {
      yield { kind: "tool_result", ok: false, preview: result.error };
      yield { kind: "error", message: result.error };
      return;
    }
    yield { kind: "tool_result", ok: true };
  } catch (e) {
    yield { kind: "tool_result", ok: false, preview: (e as Error).message };
    yield { kind: "error", message: (e as Error).message };
    return;
  }

  yield {
    kind: "result",
    durationMs: Date.now() - start,
    text: `Domain "${domainId}" initialised. Edit domain-map to refine source_paths and entity_types.`,
  };
}
