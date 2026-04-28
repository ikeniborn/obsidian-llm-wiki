import { App, Notice, TFile } from "obsidian";
import { existsSync, statSync } from "node:fs";
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

  async ingestActive(): Promise<void> {
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
    await this.dispatch("ingest", [filePath]);
  }

  async query(question: string, save: boolean): Promise<void> {
    if (!question.trim()) return;
    const op: WikiOperation = save ? "query-save" : "query";
    await this.dispatch(op, [question.trim()]);
  }

  async lint(domain: string | "all"): Promise<void> {
    const args = domain === "all" ? [] : [domain];
    await this.dispatch("lint", args);
  }

  async init(domain: string, dryRun: boolean): Promise<void> {
    const args = dryRun ? [domain, "--dry-run"] : [domain];
    await this.dispatch("init", args);
  }

  /** Список доменов из domain-map-<vault>.json. Пустой массив, если путь к навыку не задан. */
  loadDomains(): DomainEntry[] {
    const sp = resolveSkillPath(this.plugin.settings);
    if (!sp) return [];
    return readDomains(sp, this.app.vault.getName());
  }

  registerDomain(input: AddDomainInput): { ok: true } | { ok: false; error: string } {
    const sp = this.requireSkillPath();
    if (!sp) return { ok: false, error: "путь к навыку не задан" };
    const repoRoot = resolveCwd(this.plugin.settings) ?? "";
    const r = addDomain(sp, this.app.vault.getName(), repoRoot, input);
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
    const skillPath = resolveSkillPath(this.plugin.settings);
    if (!skillPath) { new Notice("Укажите путь к навыку llm-wiki в настройках"); return null; }

    const adapter = this.app.vault.adapter as unknown as VaultAdapter;
    const basePath = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const vaultTools = new VaultTools(adapter, basePath);
    const vaultName = this.app.vault.getName();
    const domains = readDomains(skillPath, vaultName);

    return new AgentRunner(this.plugin.settings, vaultTools, vaultName, domains);
  }

  private async dispatch(op: WikiOperation, args: string[]): Promise<void> {
    if (this.isBusy()) {
      new Notice("Уже выполняется операция, отмените её сначала");
      return;
    }
    if (!this.requireSkillPath()) return;

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
    const steps: RunHistoryEntry["steps"] = [];
    let finalText = "";
    let status: RunHistoryEntry["status"] = "done";

    view.setRunning(op, args);

    const spawnCwd = resolveCwd(this.plugin.settings) ?? undefined;
    const timeoutMs = this.plugin.settings.timeouts[op === "query-save" ? "query" : op] * 1000;

    let claudeRunner: IclaudeRunner | null = null;
    let runGen: AsyncGenerator<RunEvent, void, void>;

    if (this.plugin.settings.backend === "native-agent") {
      const agentRunner = this.buildAgentRunner();
      if (!agentRunner) return;
      runGen = agentRunner.run({ operation: op, args, cwd: spawnCwd, signal: ctrl.signal, timeoutMs });
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
    } finally {
      this.current = null;
    }

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
