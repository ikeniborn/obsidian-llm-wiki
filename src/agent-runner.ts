import type { DomainEntry } from "./domain-map";
import { runIngest } from "./phases/ingest";
import { runQuery } from "./phases/query";
import { runLint } from "./phases/lint";
import { runInit } from "./phases/init";
import type { LlmCallOptions, LlmClient, LlmWikiPluginSettings, RunEvent, RunRequest } from "./types";
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

  private buildOpts(): LlmCallOptions {
    const systemPrompt = this.settings.systemPrompt || undefined;
    if (this.settings.backend === "claude-agent") {
      const ca = this.settings.claudeAgent;
      return { maxTokens: ca.maxTokens, systemPrompt };
    }
    const na = this.settings.nativeAgent;
    return { temperature: na.temperature, maxTokens: na.maxTokens, topP: na.topP, systemPrompt, numCtx: na.numCtx };
  }

  async *run(req: RunRequest): AsyncGenerator<RunEvent, void, void> {
    const modelLabel =
      this.settings.backend === "claude-agent"
        ? this.settings.claudeAgent.model || "claude"
        : this.settings.nativeAgent.model;
    yield { kind: "system", message: `${this.settings.backend} / ${modelLabel}` };

    if (req.signal.aborted) return;

    const model =
      this.settings.backend === "claude-agent"
        ? this.settings.claudeAgent.model
        : this.settings.nativeAgent.model;
    const repoRoot = req.cwd ?? "";
    const opts = this.buildOpts();

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
