import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, type LlmWikiPluginSettings } from "./types";
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
      name: "Открыть панель",
      callback: () => {
        const right = this.app.workspace.getRightLeaf(false);
        if (right) void right.setViewState({ type: LLM_WIKI_VIEW_TYPE, active: true });
      },
    });

    this.addCommand({
      id: "ingest-current",
      name: "Ingest активного файла",
      callback: () => void this.controller.ingestActive(),
    });

    this.addCommand({
      id: "query",
      name: "Query (вопрос)",
      callback: () => new QueryModal(this.app, false, (q) => void this.controller.query(q, false)).open(),
    });

    this.addCommand({
      id: "query-save",
      name: "Query + сохранить как страницу",
      callback: () => new QueryModal(this.app, true, (q) => void this.controller.query(q, true)).open(),
    });

    this.addCommand({
      id: "lint",
      name: "Lint домена",
      callback: () => {
        const domains = this.controller.loadDomains();
        new DomainModal(this.app, "Lint", true, null, domains,
          (d) => void this.controller.lint(d)).open();
      },
    });

    this.addCommand({
      id: "init",
      name: "Init домена",
      callback: () => {
        const domains = this.controller.loadDomains();
        new DomainModal(this.app, "Init", false, { dryRun: true }, domains,
          (d, f) => void this.controller.init(d, f.dryRun ?? false)).open();
      },
    });

    this.addCommand({
      id: "cancel",
      name: "Отменить операцию",
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
    const data = (await this.loadData()) as Partial<LlmWikiPluginSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(data ?? {}),
      timeouts: { ...DEFAULT_SETTINGS.timeouts, ...(data?.timeouts ?? {}) },
      nativeAgent: { ...DEFAULT_SETTINGS.nativeAgent, ...(data?.nativeAgent ?? {}) },
      allowedTools: data?.allowedTools ?? DEFAULT_SETTINGS.allowedTools,
      history: data?.history ?? [],
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
