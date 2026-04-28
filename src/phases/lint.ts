import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { RunEvent } from "../types";
import type { VaultTools } from "../vault-tools";

export async function* runLint(
  args: string[],
  vaultTools: VaultTools,
  llm: OpenAI,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  signal: AbortSignal,
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
    const files = await vaultTools.listFiles(wikiVaultPath);
    yield { kind: "tool_result", ok: true, preview: `${files.length} pages` };

    const pages = await vaultTools.readAll(files);

    // Structural checks (TypeScript)
    const structuralIssues = checkStructure(pages);

    // LLM semantic check
    yield { kind: "assistant_text", delta: `Evaluating domain "${domain.id}" quality...\n` };
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You are a wiki quality reviewer. Identify content quality issues: redundancy, gaps, unclear definitions, missing context. Return a concise markdown report.",
      },
      {
        role: "user",
        content: [
          `Domain: ${domain.id} (${domain.name})`,
          `Automated issues:\n${structuralIssues || "None."}`,
          "",
          `Wiki pages:\n${[...pages.entries()].map(([p, c]) => `--- ${p} ---\n${c.slice(0, 500)}`).join("\n\n")}`,
        ].join("\n"),
      },
    ];

    let llmReport = "";
    try {
      const stream = await llm.chat.completions.create({ model, messages, stream: true }, { signal });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          llmReport += delta;
          yield { kind: "assistant_text", delta };
        }
      }
    } catch (e) {
      if (signal.aborted || (e as Error).name === "AbortError") return;
      const resp = await llm.chat.completions.create({ model, messages, stream: false });
      llmReport = resp.choices[0]?.message?.content ?? "";
      if (llmReport) yield { kind: "assistant_text", delta: llmReport };
    }

    reportParts.push(`## ${domain.id}\n${structuralIssues ? `**Structural:**\n${structuralIssues}\n\n` : ""}${llmReport}`);
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
