import { runIngest } from "./phases/ingest";
import { runQuery } from "./phases/query";
import { runLint } from "./phases/lint";
import { runInit } from "./phases/init";
export class AgentRunner {
    llm;
    settings;
    vaultTools;
    vaultName;
    domains;
    constructor(llm, settings, vaultTools, vaultName, domains) {
        this.llm = llm;
        this.settings = settings;
        this.vaultTools = vaultTools;
        this.vaultName = vaultName;
        this.domains = domains;
    }
    buildOptsFor(op) {
        const key = (op === "query-save" ? "query" : op);
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
    async *run(req) {
        const { model, opts } = this.buildOptsFor(req.operation);
        yield { kind: "system", message: `${this.settings.backend} / ${model || "claude"}` };
        if (req.signal.aborted)
            return;
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
                yield* runInit(req.args, this.vaultTools, this.llm, model, domains, repoRoot, this.vaultName, req.signal, opts);
                break;
            default: {
                const start = Date.now();
                yield { kind: "error", message: `Unknown operation: ${req.operation}` };
                yield { kind: "result", durationMs: Date.now() - start, text: "" };
            }
        }
    }
}
