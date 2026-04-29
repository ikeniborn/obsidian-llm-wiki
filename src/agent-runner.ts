import type { DomainEntry } from "./domain-map";
import { runIngest } from "./phases/ingest";
import { runQuery } from "./phases/query";
import { runLint } from "./phases/lint";
import { runInit } from "./phases/init";
import type { LlmCallOptions, LlmClient, LlmWikiPluginSettings, OpKey, RunEvent, RunRequest } from "./types";
import type { VaultTools } from "./vault-tools";

export class AgentRunner {
  constructor(
    private llm: LlmClient,
    private settings: LlmWikiPluginSettings,
    private vaultTools: VaultTools,
    private vaultName: string,
    private domains: DomainEntry[],
    private domainMapDir: string = "",
  ) {}

  private buildOptsFor(op: RunRequest["operation"]): { model: string; opts: LlmCallOptions } {
    const key = (op === "query-save" ? "query" : op) as OpKey;
    const s = this.settings;

    if (s.backend === "claude-agent") {
      if (s.claudeAgent.perOperation) {
        const c = s.claudeAgent.operations[key];
        return { model: c.model, opts: { maxTokens: c.maxTokens, systemPrompt: s.systemPrompt } };
      }
      return { model: s.claudeAgent.model, opts: { maxTokens: s.maxTokens, systemPrompt: s.systemPrompt } };
    }

    const na = s.nativeAgent;
    if (na.perOperation) {
      const c = na.operations[key];
      return { model: c.model, opts: { maxTokens: c.maxTokens, temperature: c.temperature, topP: na.topP, numCtx: na.numCtx, systemPrompt: s.systemPrompt } };
    }
    return { model: na.model, opts: { maxTokens: s.maxTokens, temperature: na.temperature, topP: na.topP, numCtx: na.numCtx, systemPrompt: s.systemPrompt } };
  }

  async *run(req: RunRequest): AsyncGenerator<RunEvent, void, void> {
    const { model, opts } = this.buildOptsFor(req.operation);
    yield { kind: "system", message: `${this.settings.backend} / ${model || "claude"}` };

    if (req.signal.aborted) return;

    const repoRoot = req.cwd ?? "";
    const domains = req.domainId
      ? this.domains.filter((d) => d.id === req.domainId)
      : this.domains;

    switch (req.operation) {
      case "ingest":
        yield* runIngest(req.args, this.vaultTools, this.llm, model, domains, repoRoot, req.signal, opts);
        break;
      case "query":
        yield* runQuery(req.args, false, this.vaultTools, this.llm, model, domains, repoRoot, req.signal, opts);
        break;
      case "query-save":
        yield* runQuery(req.args, true, this.vaultTools, this.llm, model, domains, repoRoot, req.signal, opts);
        break;
      case "lint":
        yield* runLint(req.args, this.vaultTools, this.llm, model, domains, repoRoot, req.signal, opts);
        break;
      case "init":
        yield* runInit(req.args, this.vaultTools, this.llm, model, domains, repoRoot, this.vaultName, this.domainMapDir, req.signal, opts);
        break;
      default: {
        const start = Date.now();
        yield { kind: "error", message: `Unknown operation: ${req.operation}` };
        yield { kind: "result", durationMs: Date.now() - start, text: "" };
      }
    }
  }
}
