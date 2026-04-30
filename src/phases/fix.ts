import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { LlmCallOptions, RunEvent, LlmClient } from "../types";
import type { VaultTools } from "../vault-tools";
import { buildChatParams, extractStreamDeltas } from "./llm-utils";
import { checkStructure } from "./lint";
import { parseJsonPages } from "./ingest";

const META_FILES = ["_index.md", "_log.md", "_schema.md"];

export async function* runFix(
  args: string[],
  vaultTools: VaultTools,
  llm: LlmClient,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  signal: AbortSignal,
  opts: LlmCallOptions = {},
  lintReport?: string,
): AsyncGenerator<RunEvent> {
  const domainId = args[0];
  const domain = domainId
    ? domains.find((d) => d.id === domainId)
    : domains[0];

  if (!domain) {
    yield { kind: "error", message: domainId ? `Domain "${domainId}" not found.` : "No domains configured." };
    return;
  }

  const absWiki = isAbsolute(domain.wiki_folder) ? domain.wiki_folder : join(repoRoot, domain.wiki_folder);
  const wikiVaultPath = vaultTools.toVaultPath(absWiki);
  if (!wikiVaultPath) {
    yield { kind: "error", message: `Wiki folder ${domain.wiki_folder} is outside the vault.` };
    return;
  }

  yield { kind: "tool_use", name: "Glob", input: { pattern: `${wikiVaultPath}/**/*.md` } };
  const allFiles = await vaultTools.listFiles(wikiVaultPath);
  const files = allFiles.filter((f) => !META_FILES.some((m) => f.endsWith(m)));
  yield { kind: "tool_result", ok: true, preview: `${files.length} pages` };

  if (files.length === 0) {
    const start = Date.now();
    yield { kind: "result", durationMs: Date.now() - start, text: "No wiki pages to fix." };
    return;
  }

  const pages = await vaultTools.readAll(files);
  const structuralIssues = checkStructure(pages);

  const entityTypesBlock = domain.entity_types?.length
    ? domain.entity_types.map((et) => `- ${et.type}: ${et.description}`).join("\n")
    : "";

  yield { kind: "assistant_text", delta: `Fixing wiki pages for domain "${domain.id}"...\n` };

  const start = Date.now();
  const messages = buildFixMessages(domain, wikiVaultPath, pages, structuralIssues, entityTypesBlock, lintReport);
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

  const fixedPages = parseJsonPages(fullText);
  let written = 0;
  for (const page of fixedPages) {
    yield { kind: "tool_use", name: "Write", input: { path: page.path } };
    try {
      await vaultTools.write(page.path, page.content);
      written++;
      yield { kind: "tool_result", ok: true };
    } catch (e) {
      yield { kind: "tool_result", ok: false, preview: (e as Error).message };
    }
  }

  yield {
    kind: "result",
    durationMs: Date.now() - start,
    text: written > 0 ? `Fixed ${written} wiki page(s).` : "No pages required fixes.",
  };
}

function buildFixMessages(
  domain: DomainEntry,
  wikiVaultPath: string,
  pages: Map<string, string>,
  structuralIssues: string,
  entityTypesBlock: string,
  lintReport?: string,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const today = new Date().toISOString().slice(0, 10);
  const pagesBlock = [...pages.entries()]
    .map(([p, c]) => `--- ${p} ---\n${c}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: [
        `Ты — редактор wiki-базы знаний домена «${domain.name}».`,
        `Исправь проблемы в wiki-страницах и верни только изменённые страницы.`,
        ``,
        `ПРАВИЛА ИСПРАВЛЕНИЯ:`,
        `- Мёртвые ссылки [[X]]: убери [[]] оставив текст или замени на корректную ссылку`,
        `- Отсутствующий frontmatter: добавь минимальный (wiki_updated: ${today}, wiki_status: stub)`,
        `- Дублирующийся контент: объедини, не теряй информацию`,
        `- Размытые определения: уточни по контексту домена`,
        entityTypesBlock ? `\nТИПЫ СУЩНОСТЕЙ:\n${entityTypesBlock}` : "",
        ``,
        `Верни ТОЛЬКО JSON-массив изменённых страниц (если страница не изменилась — не включай):`,
        `[{"path":"${wikiVaultPath}/EntityName.md","content":"полный контент страницы"}]`,
      ].filter(Boolean).join("\n"),
    },
    {
      role: "user",
      content: [
        `Домен: ${domain.id} (${domain.name})`,
        structuralIssues ? `\nСтруктурные проблемы:\n${structuralIssues}` : "\nСтруктурных проблем не обнаружено.",
        lintReport ? `\nОтчёт Lint (рекомендации к исправлению):\n${lintReport}` : "",
        ``,
        `Wiki-страницы:\n${pagesBlock}`,
      ].filter(Boolean).join("\n"),
    },
  ];
}
