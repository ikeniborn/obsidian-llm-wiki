import { App, Notice, TFile } from "obsidian";
import { existsSync, statSync, appendFileSync } from "node:fs";
import { relative, isAbsolute, join } from "node:path";
import { IclaudeRunner } from "./runner";
import { resolveSkillPath, resolveCwd } from "./settings";
import { LLM_WIKI_VIEW_TYPE, LlmWikiView } from "./view";
import { readDomains, addDomain, type DomainEntry, type AddDomainInput } from "./domain-map";
import type LlmWikiPlugin from "./main";
import type { RunEvent, RunHistoryEntry, WikiOperation } from "./types";
import { AgentRunner } from "./agent-runner";
import { VaultTools, type VaultAdapter } from "./vault-tools";

export class WikiController {
  private current: AbortController | null = null;
  constructor(private app: App, private plugin: LlmWikiPlugin) {}

  /** Путь к папке навыка (для UI: проверка "задан ли путь"). */
  cwdOrEmpty(): string {
    return resolveSkillPath(this.plugin.settings) ?? "";
  }

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
    const spawnCwd = resolveCwd(this.plugin.settings);
    let filePath: string;
    if (spawnCwd) {
      const rel = relative(spawnCwd, abs);
      filePath = (rel.startsWith("..") || isAbsolute(rel)) ? abs : rel;
    } else {
      filePath = abs;
    }
    await this.dispatch("ingest", [filePath], domainId);
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
    if (s.backend === "native-agent") {
      if (s.nativeAgent.domainMapDir) return s.nativeAgent.domainMapDir;
      const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
      return join(base, ".obsidian", "plugins", "llm-wiki");
    }
    return join(resolveSkillPath(s) ?? "", "shared");
  }

  /** Список доменов из domain-map-<vault>.json. */
  loadDomains(): DomainEntry[] {
    if (this.plugin.settings.backend === "claude-code") {
      const sp = resolveSkillPath(this.plugin.settings);
      if (!sp) return [];
    }
    return readDomains(this.resolveDomainMapDir(), this.app.vault.getName());
  }

  registerDomain(input: AddDomainInput): { ok: true } | { ok: false; error: string } {
    if (this.plugin.settings.backend === "claude-code") {
      const sp = this.requireSkillPath();
      if (!sp) return { ok: false, error: "путь к навыку не задан" };
    }
    const vaultBase = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const repoRoot = this.plugin.settings.backend === "native-agent"
      ? vaultBase
      : (resolveCwd(this.plugin.settings) ?? "");
    const r = addDomain(this.resolveDomainMapDir(), this.app.vault.getName(), repoRoot, input);
    if (r.ok) new Notice(`Домен «${input.id}» добавлен`);
    else new Notice(`Не удалось добавить домен: ${r.error}`);
    return r;
  }

  private requireSkillPath(): string | null {
    const sp = resolveSkillPath(this.plugin.settings);
    if (!sp) { new Notice("Укажите путь к навыку llm-wiki в настройках"); return null; }
    if (!existsSync(sp)) { new Notice(`Папка навыка не найдена: ${sp}`); return null; }
    return sp;
  }

  private requireIclaude(): string | null {
    const p = this.plugin.settings.iclaudePath;
    if (!p) { new Notice("Укажите путь к Claude Code в настройках"); return null; }
    if (!existsSync(p)) { new Notice(`Claude Code не найден: ${p}`); return null; }
    try {
      statSync(p);
    } catch {
      new Notice(`Claude Code недоступен: ${p}`);
      return null;
    }
    return p;
  }

  private buildAgentRunner(): AgentRunner | null {
    const adapter = this.app.vault.adapter as unknown as VaultAdapter;
    const basePath = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const vaultTools = new VaultTools(adapter, basePath);
    const vaultName = this.app.vault.getName();
    const domains = readDomains(this.resolveDomainMapDir(), vaultName);

    return new AgentRunner(this.plugin.settings, vaultTools, vaultName, domains);
  }

  private logEvent(sessionId: string, op: WikiOperation, domainId: string | undefined, ev: RunEvent): void {
    let logPath = this.plugin.settings.agentLogPath;
    if (!logPath) return;
    try {
      // если указана директория — дописываем имя файла
      const stat = existsSync(logPath) ? statSync(logPath) : null;
      if (stat?.isDirectory() || (!logPath.includes(".") && !logPath.endsWith("/"))) {
        logPath = join(logPath, "agent.jsonl");
      }
      const line = JSON.stringify({ ts: new Date().toISOString(), session: sessionId, op, domainId, event: ev }) + "\n";
      appendFileSync(logPath, line, "utf-8");
    } catch { /* не блокируем операцию если лог недоступен */ }
  }

  private async dispatch(op: WikiOperation, args: string[], domainId?: string): Promise<void> {
    if (this.isBusy()) {
      new Notice("Уже выполняется операция, отмените её сначала");
      return;
    }
    if (this.plugin.settings.backend === "claude-code" && !this.requireSkillPath()) return;

    // iclaudePath нужен только для claude-code backend
    let iclaudePath: string | null = null;
    if (this.plugin.settings.backend !== "native-agent") {
      iclaudePath = this.requireIclaude();
      if (!iclaudePath) return;
    }

    await this.ensureView();
    const view = this.activeView();
    if (!view) return;

    const ctrl = new AbortController();
    this.current = ctrl;

    const startedAt = Date.now();
    const sessionId = String(startedAt);
    const steps: RunHistoryEntry["steps"] = [];
    let finalText = "";
    let status: RunHistoryEntry["status"] = "done";

    this.logEvent(sessionId, op, domainId, { kind: "system", message: `start op=${op} args=${JSON.stringify(args)} domainId=${domainId ?? ""}` });
    view.setRunning(op, args);

    const spawnCwd = resolveCwd(this.plugin.settings) ?? undefined;
    const timeoutMs = this.plugin.settings.timeouts[op === "query-save" ? "query" : op] * 1000;

    let claudeRunner: IclaudeRunner | null = null;
    let runGen: AsyncGenerator<RunEvent, void, void>;

    if (this.plugin.settings.backend === "native-agent") {
      const agentRunner = this.buildAgentRunner();
      if (!agentRunner) return;
      const vaultBasePath = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? spawnCwd ?? "";
      // domain-map хранит пути вида "vaults/<vault>/!Wiki/X" относительно родительской директории.
      // Определяем эту родительскую директорию, отрезая суффикс /vaults/<vaultName>.
      const vaultName = this.app.vault.getName();
      const vaultSuffix = `/vaults/${vaultName}`;
      const repoRootForAgent = vaultBasePath.endsWith(vaultSuffix)
        ? vaultBasePath.slice(0, vaultBasePath.length - vaultSuffix.length)
        : vaultBasePath;
      runGen = agentRunner.run({ operation: op, args, cwd: repoRootForAgent, signal: ctrl.signal, timeoutMs, domainId });
    } else {
      claudeRunner = new IclaudeRunner({
        iclaudePath: iclaudePath!,
        allowedTools: this.plugin.settings.allowedTools,
        model: this.plugin.settings.model,
      });
      runGen = claudeRunner.run({ operation: op, args, cwd: spawnCwd, signal: ctrl.signal, timeoutMs });
    }

    try {
      for await (const ev of runGen) {
        if (ev.kind === "ask_user") {
          view.appendEvent(ev);
          if (claudeRunner) {
            try {
              const answer = await view.showQuestionModal(ev.question, ev.options);
              if (!claudeRunner.sendToolResult(ev.toolUseId, answer)) {
                ctrl.abort();
              }
            } catch {
              ctrl.abort();
            }
          }
          continue;
        }
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
        const pathInVault = await this.toVaultPath(spawnCwd, m[1]);
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

  private async toVaultPath(spawnCwd: string | undefined, savedPath: string): Promise<string | null> {
    const vaultDir = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const abs = isAbsolute(savedPath) ? savedPath : join(spawnCwd ?? vaultDir, savedPath);
    const rel = relative(vaultDir, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    const file = this.app.vault.getAbstractFileByPath(rel);
    return file instanceof TFile ? rel : rel;
  }
}
