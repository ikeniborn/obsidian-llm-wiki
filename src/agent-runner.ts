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
    const start = Date.now();

    let hasResult = false;
    let phase: AsyncGenerator<RunEvent>;

    switch (req.operation) {
      case "ingest":
        phase = runIngest(req.args, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "query":
        phase = runQuery(req.args, false, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "query-save":
        phase = runQuery(req.args, true, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "lint":
        phase = runLint(req.args, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "init":
        phase = runInit(req.args, this.vaultTools, this.llm, model, this.domains, repoRoot, this.vaultName, skillPath, req.signal);
        break;
      default:
        yield { kind: "error", message: `Unknown operation: ${req.operation}` };
        yield { kind: "result", durationMs: Date.now() - start, text: "" };
        return;
    }

    for await (const event of phase) {
      yield event;
      if (event.kind === "result") hasResult = true;
    }

    if (!hasResult) {
      yield { kind: "result", durationMs: Date.now() - start, text: "" };
    }
  }
}
