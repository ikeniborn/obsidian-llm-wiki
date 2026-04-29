import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, type LlmWikiPluginSettings, type RunHistoryEntry } from "./types";
import { LlmWikiSettingTab } from "./settings";
import { LLM_WIKI_VIEW_TYPE, LlmWikiView } from "./view";
import { WikiController } from "./controller";
import { QueryModal, DomainModal } from "./modals";

export default class LlmWikiPlugin extends Plugin {
  settings!: LlmWikiPluginSettings;
  controller!: WikiController;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.controller = new WikiController(this.app, this);

    this.registerView(LLM_WIKI_VIEW_TYPE, (leaf: WorkspaceLeaf) => new LlmWikiView(leaf, this));

    this.addRibbonIcon("brain-circuit", "LLM Wiki", () => {
      const leaves = this.app.workspace.getLeavesOfType(LLM_WIKI_VIEW_TYPE);
      if (leaves.length > 0) {
        this.app.workspace.revealLeaf(leaves[0]);
      } else {
        const right = this.app.workspace.getRightLeaf(false);
        if (right) void right.setViewState({ type: LLM_WIKI_VIEW_TYPE, active: true });
      }
    });

    this.addCommand({
      id: "open-panel",
      name: "Open panel",
      callback: () => {
        const right = this.app.workspace.getRightLeaf(false);
        if (right) void right.setViewState({ type: LLM_WIKI_VIEW_TYPE, active: true });
      },
    });

    this.addCommand({
      id: "ingest-current",
      name: "Ingest active file",
      callback: () => void this.controller.ingestActive(),
    });

    this.addCommand({
      id: "query",
      name: "Query",
      callback: () => new QueryModal(this.app, false, (q) => void this.controller.query(q, false)).open(),
    });

    this.addCommand({
      id: "query-save",
      name: "Query and save as page",
      callback: () => new QueryModal(this.app, true, (q) => void this.controller.query(q, true)).open(),
    });

    this.addCommand({
      id: "lint",
      name: "Lint domain",
      callback: () => {
        const domains = this.controller.loadDomains();
        new DomainModal(this.app, "Lint", true, null, domains,
          (d) => void this.controller.lint(d)).open();
      },
    });

    this.addCommand({
      id: "init",
      name: "Init domain",
      callback: () => {
        const domains = this.controller.loadDomains();
        new DomainModal(this.app, "Init", false, { dryRun: true }, domains,
          (d, f) => void this.controller.init(d, f.dryRun ?? false)).open();
      },
    });

    this.addCommand({
      id: "cancel",
      name: "Cancel operation",
      callback: () => this.controller.cancelCurrent(),
    });

    this.addSettingTab(new LlmWikiSettingTab(this.app, this));

    console.debug("[llm-wiki] loaded");
  }

  async onunload(): Promise<void> {
    this.controller.cancelCurrent();
    console.debug("[llm-wiki] unloaded");
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Record<string, unknown> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(data ?? {}),
      timeouts: { ...DEFAULT_SETTINGS.timeouts, ...((data?.timeouts as object) ?? {}) },
      nativeAgent: { ...DEFAULT_SETTINGS.nativeAgent, ...((data?.nativeAgent as object) ?? {}) },
      claudeAgent: { ...DEFAULT_SETTINGS.claudeAgent, ...((data?.claudeAgent as object) ?? {}) },
      history: (data?.history as RunHistoryEntry[]) ?? [],
    } as LlmWikiPluginSettings;

    // Миграция с claude-code backend
    if ((data?.backend as string) === "claude-code" || !this.settings.claudeAgent.iclaudePath) {
      if ((data?.backend as string) === "claude-code") {
        this.settings.backend = "claude-agent";
      }
      if (data?.iclaudePath && !this.settings.claudeAgent.iclaudePath) {
        this.settings.claudeAgent.iclaudePath = data.iclaudePath as string;
      }
      if (data?.model && !this.settings.claudeAgent.model) {
        this.settings.claudeAgent.model = data.model as string;
      }
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
