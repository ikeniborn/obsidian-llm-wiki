import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { LlmCallOptions, RunEvent, LlmClient } from "../types";
import type { VaultTools } from "../vault-tools";
import { buildChatParams, extractStreamDeltas } from "./llm-utils";

const META_FILES = ["_index.md", "_log.md", "_schema.md"];

export async function* runLint(
  args: string[],
  vaultTools: VaultTools,
  llm: LlmClient,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  signal: AbortSignal,
  opts: LlmCallOptions = {},
): AsyncGenerator<RunEvent> {
  const domainId = args[0];
  const targets = domainId
    ? domains.filter((d) => d.id === domainId)
    : domains;

  if (targets.length === 0) {
    yield { kind: "error", message: domainId ? `Domain "${domainId}" not found.` : "No domains configured." };
    return;
  }

  const start = Date.now();
  const reportParts: string[] = [];

  for (const domain of targets) {
    if (signal.aborted) return;

    const absWiki = isAbsolute(domain.wiki_folder) ? domain.wiki_folder : join(repoRoot, domain.wiki_folder);
    const wikiVaultPath = vaultTools.toVaultPath(absWiki);
    if (!wikiVaultPath) {
      reportParts.push(`## ${domain.id}\nWiki folder outside vault — skipped.`);
      continue;
    }

    yield { kind: "tool_use", name: "Glob", input: { pattern: `${wikiVaultPath}/**/*.md` } };
    const allFiles = await vaultTools.listFiles(wikiVaultPath);
    const files = allFiles.filter((f) => !META_FILES.some((m) => f.endsWith(m)));
    yield { kind: "tool_result", ok: true, preview: `${files.length} pages` };

    const pages = await vaultTools.readAll(files);

    const structuralIssues = checkStructure(pages);

    const entityTypesBlock = buildEntityTypesBlock(domain);

    yield { kind: "assistant_text", delta: `Evaluating domain "${domain.id}" quality...\n` };
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: [
          `Ты — рецензент качества wiki-базы знаний домена «${domain.name}».`,
          `Выявляй: дублирование, пробелы, размытые определения, устаревший контент.`,
          `Верни краткий отчёт в markdown.`,
          entityTypesBlock ? `\nТИПЫ СУЩНОСТЕЙ ДОМЕНА:\n${entityTypesBlock}` : "",
        ].filter(Boolean).join("\n"),
      },
      {
        role: "user",
        content: [
          `Домен: ${domain.id} (${domain.name})`,
          `Автоматические проблемы:\n${structuralIssues || "Нет."}`,
          "",
          `Wiki-страницы:\n${[...pages.entries()].map(([p, c]) => `--- ${p} ---\n${c.slice(0, 500)}`).join("\n\n")}`,
        ].join("\n"),
      },
    ];

    const params = buildChatParams(model, messages, opts);
    let llmReport = "";
    try {
      const stream = await llm.chat.completions.create(
        { ...params, stream: true } as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
        { signal },
      );
      for await (const chunk of stream) {
        const { reasoning, content } = extractStreamDeltas(chunk);
        if (reasoning) yield { kind: "assistant_text", delta: reasoning, isReasoning: true };
        if (content) { llmReport += content; yield { kind: "assistant_text", delta: content }; }
      }
    } catch (e) {
      if (signal.aborted || (e as Error).name === "AbortError") return;
      const resp = await llm.chat.completions.create(
        { ...params, stream: false } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      );
      llmReport = resp.choices[0]?.message?.content ?? "";
      if (llmReport) yield { kind: "assistant_text", delta: llmReport };
    }

    reportParts.push(`## ${domain.id}\n${structuralIssues ? `**Структурные проблемы:**\n${structuralIssues}\n\n` : ""}${llmReport}`);
  }

  yield { kind: "result", durationMs: Date.now() - start, text: reportParts.join("\n\n---\n\n") };
}

function checkStructure(pages: Map<string, string>): string {
  const issues: string[] = [];
  for (const [path, content] of pages) {
    if (!content.startsWith("---")) {
      issues.push(`- ${path}: missing frontmatter`);
    }
    const links = [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
    for (const link of links) {
      const linked = [...pages.keys()].some((p) => p.endsWith(`${link}.md`));
      if (!linked) issues.push(`- ${path}: dead link [[${link}]]`);
    }
  }
  return issues.join("\n");
}

function buildEntityTypesBlock(domain: DomainEntry): string {
  if (!domain.entity_types?.length) return "";
  return domain.entity_types
    .map((et) => `- ${et.type}: ${et.description}`)
    .join("\n");
}
