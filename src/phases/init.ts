import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { LlmCallOptions, RunEvent, LlmClient } from "../types";
import type { VaultTools } from "../vault-tools";
import { buildChatParams, extractStreamDeltas } from "./llm-utils";

export async function* runInit(
  args: string[],
  vaultTools: VaultTools,
  llm: LlmClient,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  vaultName: string,
  domainMapDir: string,
  signal: AbortSignal,
  opts: LlmCallOptions = {},
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

  const allFiles = await vaultTools.listFiles("");
  const sampleFiles = allFiles.slice(0, 5);
  const samples = await vaultTools.readAll(sampleFiles);

  // Determine likely wiki root from vault structure
  const wikiRootGuess = `!Wiki`;
  const [schemaContent, indexContent] = await Promise.all([
    tryRead(vaultTools, `${wikiRootGuess}/_schema.md`),
    tryRead(vaultTools, `${wikiRootGuess}/_index.md`),
  ]);

  const systemContent = [
    `Ты — архитектор wiki-базы знаний. Сгенерируй запись домена для domain-map.json.`,
    `Верни ТОЛЬКО валидный JSON следующей структуры:`,
    `{`,
    `  "id": "${domainId}",`,
    `  "name": "Человекочитаемое название",`,
    `  "wiki_folder": "vaults/${vaultName}/!Wiki/${domainId}",`,
    `  "source_paths": ["relative/source/path"],`,
    `  "entity_types": [{"type":"...","description":"...","extraction_cues":["..."],"min_mentions_for_page":1,"wiki_subfolder":"${domainId}/..."}],`,
    `  "language_notes": ""`,
    `}`,
    schemaContent ? `\nКонвенции вики (_schema.md):\n${schemaContent.slice(0, 1500)}` : "",
    indexContent ? `\nСуществующая структура (_index.md):\n${indexContent.slice(0, 1000)}` : "",
  ].filter(Boolean).join("\n");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    {
      role: "user",
      content: [
        `Domain ID: ${domainId}`,
        `Vault name: ${vaultName}`,
        "",
        `Примеры файлов vault:`,
        [...samples.entries()].map(([p, c]) => `${p}:\n${c.slice(0, 400)}`).join("\n\n"),
      ].join("\n"),
    },
  ];

  const params = buildChatParams(model, messages, opts);
  let fullText = "";
  try {
    const stream = await llm.chat.completions.create(
      { ...params, stream: true } as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      { signal },
    );
    for await (const chunk of stream) {
      const { reasoning, content } = extractStreamDeltas(chunk);
      if (reasoning) yield { kind: "assistant_text", delta: reasoning, isReasoning: true };
      if (content) { fullText += content; yield { kind: "assistant_text", delta: content }; }
    }
  } catch (e) {
    if (signal.aborted || (e as Error).name === "AbortError") return;
    const resp = await llm.chat.completions.create(
      { ...params, stream: false } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    );
    fullText = resp.choices[0]?.message?.content ?? "";
    if (fullText) yield { kind: "assistant_text", delta: fullText };
  }

  if (signal.aborted) return;

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

  const { domainMapPath, addDomain } = await import("../domain-map");
  const dmPath = domainMapPath(domainMapDir, vaultName);
  yield { kind: "tool_use", name: "Write", input: { path: dmPath } };

  try {
    const result = addDomain(domainMapDir, vaultName, repoRoot, {
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

  // Append log entry
  await appendLog(vaultTools, wikiRootGuess, domainId);

  yield {
    kind: "result",
    durationMs: Date.now() - start,
    text: `Domain "${domainId}" initialised. Edit domain-map to refine source_paths and entity_types.`,
  };
}

async function appendLog(vaultTools: VaultTools, wikiRoot: string, domainId: string): Promise<void> {
  const logPath = `${wikiRoot}/_log.md`;
  const today = new Date().toISOString().slice(0, 10);
  const entry = `\n## ${today} — init — ${domainId}\n- Домен создан\n`;
  try {
    const existing = await tryRead(vaultTools, logPath);
    await vaultTools.write(logPath, existing + entry);
  } catch { /* не критично */ }
}

async function tryRead(vaultTools: VaultTools, path: string): Promise<string> {
  try { return await vaultTools.read(path); } catch { return ""; }
}
