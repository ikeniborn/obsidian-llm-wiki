import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { RunEvent } from "../types";
import type { VaultTools } from "../vault-tools";

const MAX_CONTEXT_CHARS = 80_000;

export async function* runQuery(
  args: string[],
  save: boolean,
  vaultTools: VaultTools,
  llm: OpenAI,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const question = args[0]?.trim();
  if (!question) {
    yield { kind: "error", message: "query: question required" };
    return;
  }

  const domain = domains[0];
  if (!domain) {
    yield { kind: "error", message: "No domain configured. Add a domain in settings." };
    return;
  }

  const absWiki = isAbsolute(domain.wiki_folder) ? domain.wiki_folder : join(repoRoot, domain.wiki_folder);
  const wikiVaultPath = vaultTools.toVaultPath(absWiki);
  if (!wikiVaultPath) {
    yield { kind: "error", message: `Wiki folder ${domain.wiki_folder} is outside the vault.` };
    return;
  }

  yield { kind: "tool_use", name: "Glob", input: { pattern: `${wikiVaultPath}/**/*.md` } };
  const files = await vaultTools.listFiles(wikiVaultPath);
  yield { kind: "tool_result", ok: true, preview: `${files.length} pages` };

  const pages = await vaultTools.readAll(files);

  const start = Date.now();

  let contextBlock = [...pages.entries()]
    .map(([p, c]) => `--- ${p} ---\n${c}`)
    .join("\n\n");

  if (contextBlock.length > MAX_CONTEXT_CHARS) {
    contextBlock = contextBlock.slice(0, MAX_CONTEXT_CHARS) + "\n[...truncated]";
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "You are a wiki query assistant. Answer based only on the provided wiki pages. Be concise and accurate.",
    },
    {
      role: "user",
      content: `Question: ${question}\n\nWiki pages:\n${contextBlock}`,
    },
  ];

  let answer = "";
  try {
    const stream = await llm.chat.completions.create(
      { model, messages, stream: true },
      { signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        answer += delta;
        yield { kind: "assistant_text", delta };
      }
    }
  } catch (e) {
    if (signal.aborted || (e as Error).name === "AbortError") return;
    const resp = await llm.chat.completions.create({ model, messages, stream: false });
    answer = resp.choices[0]?.message?.content ?? "";
    if (answer) yield { kind: "assistant_text", delta: answer };
  }

  if (signal.aborted) return;

  if (save && answer) {
    const slug = question.slice(0, 40).replace(/[^a-zA-Z0-9а-яёА-ЯЁ\s]/g, "").trim().replace(/\s+/g, "-");
    const savePath = `${wikiVaultPath}/Q-${slug}.md`;
    const pageContent = `# ${question}\n\n${answer}\n`;
    yield { kind: "tool_use", name: "Write", input: { path: savePath } };
    try {
      await vaultTools.write(savePath, pageContent);
      yield { kind: "tool_result", ok: true };
      yield { kind: "result", durationMs: Date.now() - start, text: `Создана страница: ${savePath}\n\n${answer}` };
    } catch (e) {
      yield { kind: "tool_result", ok: false, preview: (e as Error).message };
      yield { kind: "result", durationMs: Date.now() - start, text: answer };
    }
  } else {
    yield { kind: "result", durationMs: Date.now() - start, text: answer };
  }
}
