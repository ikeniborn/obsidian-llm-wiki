import OpenAI from "openai";
import type { DomainEntry } from "./domain-map";
import { runIngest } from "./phases/ingest";
import { runQuery } from "./phases/query";
import { runLint } from "./phases/lint";
import { runInit } from "./phases/init";
import type { LlmWikiPluginSettings, RunEvent, RunRequest } from "./types";
import type { VaultTools } from "./vault-tools";

export class AgentRunner {
  private llm: OpenAI;

  constructor(
    private settings: LlmWikiPluginSettings,
    private vaultTools: VaultTools,
    private vaultName: string,
    private domains: DomainEntry[],
  ) {
    this.llm = new OpenAI({
      baseURL: settings.nativeAgent.baseUrl,
      apiKey: settings.nativeAgent.apiKey,
    });
  }

  _overrideLlm(llm: OpenAI): void {
    this.llm = llm;
  }

  async *run(req: RunRequest): AsyncGenerator<RunEvent, void, void> {
    yield { kind: "system", message: `native-agent / ${this.settings.nativeAgent.model}` };

    if (req.signal.aborted) return;

    const model = this.settings.nativeAgent.model;
    const repoRoot = req.cwd ?? "";
    const skillPath = this.settings.cwd;

    switch (req.operation) {
      case "ingest":
        yield* runIngest(req.args, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "query":
        yield* runQuery(req.args, false, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "query-save":
        yield* runQuery(req.args, true, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "lint":
        yield* runLint(req.args, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "init":
        yield* runInit(req.args, this.vaultTools, this.llm, model, this.domains, repoRoot, this.vaultName, skillPath, req.signal);
        break;
      default:
        const start = Date.now();
        yield { kind: "error", message: `Unknown operation: ${req.operation}` };
        yield { kind: "result", durationMs: Date.now() - start, text: "" };
        return;
    }
  }
}
