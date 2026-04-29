import { App, Notice, TFile } from "obsidian";
import { existsSync, appendFileSync, statSync } from "node:fs";
import { relative, isAbsolute, join } from "node:path";
import { LLM_WIKI_VIEW_TYPE, LlmWikiView } from "./view";
import { readDomains, addDomain, type DomainEntry, type AddDomainInput } from "./domain-map";
import type LlmWikiPlugin from "./main";
import type { RunEvent, RunHistoryEntry, WikiOperation } from "./types";
import { AgentRunner } from "./agent-runner";
import { VaultTools, type VaultAdapter } from "./vault-tools";
import { ClaudeCliClient } from "./claude-cli-client";
import OpenAI from "openai";

export class WikiController {
  private current: AbortController | null = null;
  constructor(private app: App, private plugin: LlmWikiPlugin) {}

  isBusy(): boolean { return this.current !== null; }

  cancelCurrent(): void {
    if (this.current) {
      this.current.abort();
      new Notice("Отмена…");
    }
  }

  async ingestActive(domainId?: string): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice("Нет активного файла"); return; }
    const abs = (this.app.vault.adapter as { getFullPath: (p: string) => string }).getFullPath(file.path);
    await this.dispatch("ingest", [abs], domainId);
  }

  async query(question: string, save: boolean, domainId?: string): Promise<void> {
    if (!question.trim()) return;
    const op: WikiOperation = save ? "query-save" : "query";
    await this.dispatch(op, [question.trim()], domainId);
  }

  async lint(domain: string | "all"): Promise<void> {
    const args = domain === "all" ? [] : [domain];
    await this.dispatch("lint", args);
  }

  async init(domain: string, dryRun: boolean): Promise<void> {
    const args = dryRun ? [domain, "--dry-run"] : [domain];
    await this.dispatch("init", args);
  }

  private resolveDomainMapDir(): string {
    const s = this.plugin.settings;
    const dir = s.backend === "claude-agent"
      ? s.claudeAgent.domainMapDir
      : s.nativeAgent.domainMapDir;
    if (dir) return dir;
    const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    return join(base, ".obsidian", "plugins", "llm-wiki");
  }

  loadDomains(): DomainEntry[] {
    return readDomains(this.resolveDomainMapDir(), this.app.vault.getName());
  }

  registerDomain(input: AddDomainInput): { ok: true } | { ok: false; error: string } {
    const vaultBase = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const r = addDomain(this.resolveDomainMapDir(), this.app.vault.getName(), vaultBase, input);
    if (r.ok) new Notice(`Домен «${input.id}» добавлен`);
    else new Notice(`Не удалось добавить домен: ${r.error}`);
    return r;
  }

  private requireClaudeAgent(): string | null {
    const p = this.plugin.settings.claudeAgent.iclaudePath;
    if (!p || !existsSync(p)) {
      new Notice("Укажите путь к Claude Code в настройках");
      return null;
    }
    return p;
  }

  private buildAgentRunner(): AgentRunner {
    const adapter = this.app.vault.adapter as unknown as VaultAdapter;
    const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const vaultTools = new VaultTools(adapter, base);
    const vaultName = this.app.vault.getName();
    const domainMapDir = this.resolveDomainMapDir();
    const domains = readDomains(domainMapDir, vaultName);
    const s = this.plugin.settings;

    const llm = s.backend === "claude-agent"
      ? new ClaudeCliClient(s.claudeAgent)
      : new OpenAI({
          baseURL: s.nativeAgent.baseUrl,
          apiKey: s.nativeAgent.apiKey,
          timeout: s.nativeAgent.requestTimeoutSec * 1000,
          dangerouslyAllowBrowser: true,
        });

    return new AgentRunner(llm, s, vaultTools, vaultName, domains, domainMapDir);
  }

  private logEvent(sessionId: string, op: WikiOperation, domainId: string | undefined, ev: RunEvent): void {
    let logPath = this.plugin.settings.agentLogPath;
    if (!logPath) return;
    try {
      const stat = existsSync(logPath) ? statSync(logPath) : null;
      if (stat?.isDirectory() || (!logPath.includes(".") && !logPath.endsWith("/"))) {
        logPath = join(logPath, "agent.jsonl");
      }
      const line = JSON.stringify({ ts: new Date().toISOString(), session: sessionId, op, domainId, event: ev }) + "\n";
      appendFileSync(logPath, line, "utf-8");
    } catch { /* не блокируем операцию */ }
  }

  private async dispatch(op: WikiOperation, args: string[], domainId?: string): Promise<void> {
    if (this.isBusy()) {
      new Notice("Уже выполняется операция, отмените её сначала");
      return;
    }

    if (this.plugin.settings.backend === "claude-agent" && !this.requireClaudeAgent()) return;

    await this.ensureView();
    const view = this.activeView();
    if (!view) return;

    const agentRunner = this.buildAgentRunner();

    const ctrl = new AbortController();
    this.current = ctrl;

    const startedAt = Date.now();
    const sessionId = String(startedAt);
    const steps: RunHistoryEntry["steps"] = [];
    let finalText = "";
    let status: RunHistoryEntry["status"] = "done";

    this.logEvent(sessionId, op, domainId, { kind: "system", message: `start op=${op} args=${JSON.stringify(args)} domainId=${domainId ?? ""}` });
    view.setRunning(op, args);

    const vaultBasePath = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const vaultName = this.app.vault.getName();
    const vaultSuffix = `/vaults/${vaultName}`;
    const repoRoot = vaultBasePath.endsWith(vaultSuffix)
      ? vaultBasePath.slice(0, vaultBasePath.length - vaultSuffix.length)
      : vaultBasePath;

    const timeoutMs = this.plugin.settings.timeouts[op === "query-save" ? "query" : op] * 1000;
    const runGen = agentRunner.run({ operation: op, args, cwd: repoRoot, signal: ctrl.signal, timeoutMs, domainId });

    try {
      for await (const ev of runGen) {
        this.logEvent(sessionId, op, domainId, ev);
        view.appendEvent(ev);
        this.collectStep(ev, steps);
        if (ev.kind === "result") finalText = ev.text;
        if (ev.kind === "error") status = "error";
        if (ev.kind === "exit") {
          if (ev.code !== 0 && status === "done") status = "error";
          if (ctrl.signal.aborted) status = "cancelled";
        }
      }
    } catch (err) {
      status = "error";
      finalText = `Ошибка: ${(err as Error).message}`;
      this.logEvent(sessionId, op, domainId, { kind: "error", message: finalText });
    } finally {
      this.current = null;
    }
    this.logEvent(sessionId, op, domainId, { kind: "system", message: `finish status=${status} durationMs=${Date.now() - startedAt}` });

    const entry: RunHistoryEntry = {
      id: `${startedAt}`,
      operation: op,
      args,
      startedAt,
      finishedAt: Date.now(),
      status,
      finalText,
      steps,
    };
    this.plugin.settings.history.push(entry);
    while (this.plugin.settings.history.length > this.plugin.settings.historyLimit) {
      this.plugin.settings.history.shift();
    }
    await this.plugin.saveSettings();
    await view.finish(entry);

    if (op === "query-save" && status === "done") {
      const m = finalText.match(/Создана\s+страница:\s*([^\s`'"]+)/i);
      if (m) {
        const pathInVault = await this.toVaultPath(vaultBasePath, m[1]);
        if (pathInVault) await this.app.workspace.openLinkText(pathInVault, "");
      }
    }
  }

  private collectStep(ev: RunEvent, steps: RunHistoryEntry["steps"]): void {
    if (ev.kind === "tool_use") {
      const inp = (ev.input as { file_path?: string; pattern?: string }) ?? {};
      steps.push({ kind: "tool_use", label: `${ev.name} ${inp.file_path ?? inp.pattern ?? ""}`.trim() });
    } else if (ev.kind === "tool_result") {
      steps.push({ kind: "tool_result", label: ev.ok ? "ok" : "error" });
    }
  }

  private async ensureView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(LLM_WIKI_VIEW_TYPE);
    if (leaves.length === 0) {
      const right = this.app.workspace.getRightLeaf(false);
      if (right) await right.setViewState({ type: LLM_WIKI_VIEW_TYPE, active: true });
    } else {
      this.app.workspace.revealLeaf(leaves[0]);
    }
  }

  private activeView(): LlmWikiView | null {
    const leaves = this.app.workspace.getLeavesOfType(LLM_WIKI_VIEW_TYPE);
    const view = leaves[0]?.view;
    return view instanceof LlmWikiView ? view : null;
  }

  private async toVaultPath(vaultDir: string, savedPath: string): Promise<string | null> {
    const abs = isAbsolute(savedPath) ? savedPath : join(vaultDir, savedPath);
    const rel = relative(vaultDir, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    const file = this.app.vault.getAbstractFileByPath(rel);
    return file instanceof TFile ? rel : rel;
  }
}
