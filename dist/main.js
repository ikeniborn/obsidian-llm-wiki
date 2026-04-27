"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => LlmWikiPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/types.ts
var MODEL_PRESETS = [
  { value: "", label: "(\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E)" },
  { value: "opus", label: "opus (Opus 4.7)" },
  { value: "sonnet", label: "sonnet (Sonnet 4.6)" },
  { value: "haiku", label: "haiku (Haiku 4.5)" }
];
var DEFAULT_SETTINGS = {
  iclaudePath: "",
  cwd: "",
  allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"],
  model: "",
  showRawJson: false,
  historyLimit: 20,
  timeouts: { ingest: 300, query: 300, lint: 600, init: 3600 },
  history: []
};

// src/settings.ts
var import_obsidian = require("obsidian");
var import_node_path = require("node:path");
var LlmWikiSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    containerEl.createEl("h2", { text: "LLM Wiki" });
    new import_obsidian.Setting(containerEl).setName("\u041F\u0443\u0442\u044C \u043A Claude Code").setDesc("\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E. \u041F\u043E\u043B\u043D\u044B\u0439 \u0430\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A iclaude.sh / iclaude / claude.").addText(
      (t) => t.setPlaceholder("/home/user/Documents/Project/iclaude/iclaude.sh").setValue(s.iclaudePath).onChange(async (v) => {
        s.iclaudePath = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u041F\u0443\u0442\u044C \u043A \u043D\u0430\u0432\u044B\u043A\u0443 llm-wiki").setDesc("\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E. \u041F\u043E\u043B\u043D\u044B\u0439 \u0430\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435 \u043D\u0430\u0432\u044B\u043A\u0430 (\u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 shared/domain-map.json).").addText(
      (t) => t.setPlaceholder("/home/user/Documents/Project/iclaude/.nvm-isolated/.claude-isolated/skills/llm-wiki").setValue(s.cwd).onChange(async (v) => {
        s.cwd = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Allowed tools").setDesc("\u0421\u043F\u0438\u0441\u043E\u043A \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E: Read,Edit,Write,Glob,Grep").addText(
      (t) => t.setValue(s.allowedTools.join(",")).onChange(async (v) => {
        s.allowedTools = v.split(",").map((x) => x.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u041C\u043E\u0434\u0435\u043B\u044C").setDesc("\u041F\u0435\u0440\u0435\u0434\u0430\u0451\u0442\u0441\u044F claude \u043A\u0430\u043A --model. \u041F\u0440\u0435\u0441\u0435\u0442, \u043B\u0438\u0431\u043E \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u043B\u044C\u043D\u044B\u0439 ID (claude-opus-4-7 \u0438 \u0442.\u043F.).").addDropdown((d) => {
      for (const p of MODEL_PRESETS)
        d.addOption(p.value, p.label);
      if (s.model && !MODEL_PRESETS.some((p) => p.value === s.model)) {
        d.addOption(s.model, s.model);
      }
      d.setValue(s.model);
      d.onChange(async (v) => {
        s.model = v;
        await this.plugin.saveSettings();
      });
    }).addText(
      (t) => t.setPlaceholder("custom: claude-opus-4-7").setValue(MODEL_PRESETS.some((p) => p.value === s.model) ? "" : s.model).onChange(async (v) => {
        const trimmed = v.trim();
        if (trimmed) {
          s.model = trimmed;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u041B\u0438\u043C\u0438\u0442 \u0438\u0441\u0442\u043E\u0440\u0438\u0438").addText(
      (t) => t.setValue(String(s.historyLimit)).onChange(async (v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) {
          s.historyLimit = Math.floor(n);
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u0422\u0430\u0439\u043C\u0430\u0443\u0442\u044B (\u0441\u0435\u043A\u0443\u043D\u0434\u044B)").setDesc("ingest / query / lint / init").addText(
      (t) => t.setValue(`${s.timeouts.ingest}/${s.timeouts.query}/${s.timeouts.lint}/${s.timeouts.init}`).onChange(async (v) => {
        const parts = v.split("/").map((x) => Number(x.trim()));
        if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n > 0)) {
          s.timeouts = { ingest: parts[0], query: parts[1], lint: parts[2], init: parts[3] };
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C raw JSON \u0432 \u043F\u0430\u043D\u0435\u043B\u0438").addToggle(
      (t) => t.setValue(s.showRawJson).onChange(async (v) => {
        s.showRawJson = v;
        await this.plugin.saveSettings();
      })
    );
    if (import_obsidian.Platform.isMobile) {
      containerEl.createEl("p", { text: "\u26A0 Mobile \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F (\u043D\u0435\u0442 child_process)." });
    }
  }
};
function resolveSkillPath(settings) {
  return settings.cwd || null;
}
function resolveCwd(settings) {
  if (!settings.cwd)
    return null;
  return (0, import_node_path.resolve)(settings.cwd, "../../..");
}

// src/view.ts
var import_obsidian3 = require("obsidian");

// src/modals.ts
var import_obsidian2 = require("obsidian");
var ConfirmModal = class extends import_obsidian2.Modal {
  constructor(app, title, lines, onConfirm) {
    super(app);
    this.title = title;
    this.lines = lines;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    for (const line of this.lines) {
      contentEl.createEl("p", { text: line });
    }
    new import_obsidian2.Setting(contentEl).addButton((b) => b.setButtonText("\u041E\u0442\u043C\u0435\u043D\u0430").onClick(() => this.close())).addButton((b) => b.setButtonText("\u25B6 \u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C").setCta().onClick(() => {
      this.close();
      this.onConfirm();
    }));
  }
  onClose() {
    this.contentEl.empty();
  }
};
var QueryModal = class extends import_obsidian2.Modal {
  constructor(app, save, onSubmit) {
    super(app);
    this.save = save;
    this.onSubmit = onSubmit;
  }
  question = "";
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.save ? "Query + \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" : "Query" });
    const ta = contentEl.createEl("textarea", {
      attr: { rows: "5", style: "width:100%;" },
      placeholder: "\u0421\u0444\u043E\u0440\u043C\u0443\u043B\u0438\u0440\u0443\u0439\u0442\u0435 \u0432\u043E\u043F\u0440\u043E\u0441\u2026"
    });
    ta.addEventListener("input", () => {
      this.question = ta.value;
    });
    new import_obsidian2.Setting(contentEl).addButton(
      (b) => b.setButtonText("\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C").setCta().onClick(() => {
        const q = this.question.trim();
        if (!q)
          return;
        this.close();
        this.onSubmit(q);
      })
    );
    setTimeout(() => ta.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var DomainModal = class extends import_obsidian2.Modal {
  constructor(app, title, allowAll, extra, domains, onSubmit) {
    super(app);
    this.title = title;
    this.allowAll = allowAll;
    this.extra = extra;
    this.domains = domains;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    let domain = this.allowAll ? "all" : this.domains[0]?.id ?? "";
    let dryRun = false;
    if (this.domains.length === 0) {
      new import_obsidian2.Setting(contentEl).setName("\u0414\u043E\u043C\u0435\u043D").setDesc("\u0414\u043E\u043C\u0435\u043D\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0434\u043E\u043C\u0435\u043D \u0447\u0435\u0440\u0435\u0437 \xAB\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0434\u043E\u043C\u0435\u043D\xBB.").addText((t) => t.setPlaceholder("id \u0434\u043E\u043C\u0435\u043D\u0430").onChange((v) => {
        domain = v.trim();
      }));
    } else {
      new import_obsidian2.Setting(contentEl).setName("\u0414\u043E\u043C\u0435\u043D").addDropdown((d) => {
        if (this.allowAll)
          d.addOption("all", "(\u0432\u0441\u044F \u0432\u0438\u043A\u0438)");
        for (const entry of this.domains) {
          d.addOption(entry.id, entry.name || entry.id);
        }
        d.setValue(domain);
        d.onChange((v) => {
          domain = v;
        });
      });
    }
    if (this.extra && "dryRun" in this.extra) {
      new import_obsidian2.Setting(contentEl).setName("--dry-run").addToggle((t) => t.onChange((v) => {
        dryRun = v;
      }));
    }
    new import_obsidian2.Setting(contentEl).addButton(
      (b) => b.setButtonText("\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C").setCta().onClick(() => {
        this.close();
        this.onSubmit(domain, { dryRun });
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
function defaultSourcePaths(wikiFolder) {
  return wikiFolder ? [wikiFolder] : [];
}
var AddDomainModal = class extends import_obsidian2.Modal {
  constructor(app, wikiRoot, onSubmit) {
    super(app);
    this.wikiRoot = wikiRoot;
    this.onSubmit = onSubmit;
  }
  input = { id: "", name: "", wikiFolder: "", sourcePaths: [] };
  wikiFolderInput = null;
  sourcePathsInput = null;
  sourcePathsTouched = false;
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0434\u043E\u043C\u0435\u043D" });
    new import_obsidian2.Setting(contentEl).setName("ID").setDesc("\u0411\u0443\u043A\u0432\u044B (\u0432\u043A\u043B\u044E\u0447\u0430\u044F \u043A\u0438\u0440\u0438\u043B\u043B\u0438\u0446\u0443), \u0446\u0438\u0444\u0440\u044B, \u0434\u0435\u0444\u0438\u0441, \u043F\u043E\u0434\u0447\u0451\u0440\u043A\u0438\u0432\u0430\u043D\u0438\u0435. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u043A\u0430\u043A \u0438\u043C\u044F \u043F\u0430\u043F\u043A\u0438.").addText(
      (t) => t.setPlaceholder("\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043F\u0440\u043E\u0435\u043A\u0442\u044B").onChange((v) => {
        this.input.id = v.trim();
        if (this.wikiFolderInput && !this.input.wikiFolder) {
          const auto = `${this.wikiRoot}/${this.input.id}`;
          this.wikiFolderInput.setValue(auto);
          if (!this.sourcePathsTouched && this.sourcePathsInput) {
            this.sourcePathsInput.setValue(auto);
            this.input.sourcePaths = defaultSourcePaths(auto);
          }
        }
      })
    );
    new import_obsidian2.Setting(contentEl).setName("\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u043C\u043E\u0435 \u0438\u043C\u044F").addText((t) => t.setPlaceholder("\u041F\u0440\u043E\u0435\u043A\u0442\u044B").onChange((v) => {
      this.input.name = v.trim();
    }));
    new import_obsidian2.Setting(contentEl).setName("Wiki folder").setDesc(`\u041F\u0443\u0442\u044C \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u043E cwd. \u041F\u0443\u0441\u0442\u043E = ${this.wikiRoot}/<id>.`).addText((t) => {
      t.setPlaceholder(`${this.wikiRoot}/<id>`).onChange((v) => {
        this.input.wikiFolder = v.trim();
        if (!this.sourcePathsTouched && this.sourcePathsInput) {
          this.sourcePathsInput.setValue(v.trim());
          this.input.sourcePaths = defaultSourcePaths(v.trim());
        }
      });
      this.wikiFolderInput = t;
    });
    new import_obsidian2.Setting(contentEl).setName("Source paths").setDesc("\u0421\u043F\u0438\u0441\u043E\u043A \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 wiki folder.").addText((t) => {
      t.setPlaceholder("vaults/Work/\u041F\u0440\u043E\u0435\u043A\u0442\u044B/").onChange((v) => {
        this.sourcePathsTouched = true;
        this.input.sourcePaths = v.split(",").map((s) => s.trim()).filter(Boolean);
      });
      this.sourcePathsInput = t;
    });
    contentEl.createEl("p", {
      text: "\u0417\u0430\u043F\u0438\u0441\u044C \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u0441\u044F \u0432 domain-map-<vault>.json \u0441 \u043F\u0443\u0441\u0442\u044B\u043C\u0438 entity_types. \u0414\u043B\u044F \u043F\u043E\u043B\u043D\u043E\u0446\u0435\u043D\u043D\u043E\u0433\u043E ingest \u043F\u043E\u0437\u0436\u0435 \u043E\u0442\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0439\u0442\u0435 JSON \u0438 \u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 entity_types/extraction_cues.",
      cls: "muted"
    });
    new import_obsidian2.Setting(contentEl).addButton(
      (b) => b.setButtonText("\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C").setCta().onClick(() => {
        if (!this.input.id)
          return;
        this.close();
        this.onSubmit(this.input);
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/view.ts
var LLM_WIKI_VIEW_TYPE = "llm-wiki-view";
var PREVIEW_INLINE = 140;
var ASSISTANT_TEXT_MAX = 600;
var LlmWikiView = class extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  state = "idle";
  stepsEl;
  finalEl;
  historyEl;
  statusEl;
  progressToggle;
  progressCount;
  stepsOpen = true;
  cancelBtn;
  queryInput;
  askBtn;
  askSaveBtn;
  domainSelect;
  lintBtn;
  initBtn;
  ingestBtn;
  startTs = 0;
  toolCount = 0;
  stepCount = 0;
  tickHandle = null;
  currentToolStep = null;
  currentToolStartedAt = 0;
  assistantBlock = null;
  assistantBuffer = "";
  getViewType() {
    return LLM_WIKI_VIEW_TYPE;
  }
  getDisplayText() {
    return "LLM Wiki";
  }
  getIcon() {
    return "brain-circuit";
  }
  async onOpen() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("llm-wiki-view");
    const header = root.createDiv("llm-wiki-header");
    header.createEl("h3", { text: "LLM Wiki" });
    this.statusEl = header.createDiv("llm-wiki-status");
    const domainBox = root.createDiv("llm-wiki-domain");
    const domainRow = domainBox.createDiv("llm-wiki-domain-row");
    domainRow.createSpan({ cls: "muted", text: "\u0414\u043E\u043C\u0435\u043D:" });
    this.domainSelect = domainRow.createEl("select", { cls: "llm-wiki-domain-select" });
    const refreshBtn = domainRow.createEl("button", { text: "\u21BB", attr: { title: "\u041F\u0435\u0440\u0435\u0447\u0438\u0442\u0430\u0442\u044C domain-map.json" } });
    refreshBtn.addEventListener("click", () => this.refreshDomains());
    const addBtn = domainRow.createEl("button", { text: "+ \u0414\u043E\u043C\u0435\u043D" });
    addBtn.addEventListener("click", () => this.openAddDomain());
    const actionRow = domainBox.createDiv("llm-wiki-domain-actions");
    this.ingestBtn = actionRow.createEl("button", { text: "Ingest" });
    this.lintBtn = actionRow.createEl("button", { text: "Lint" });
    this.initBtn = actionRow.createEl("button", { text: "Init" });
    this.ingestBtn.addEventListener("click", () => {
      const file = this.plugin.app.workspace.getActiveFile();
      if (!file) {
        new import_obsidian3.Notice("\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430");
        return;
      }
      new ConfirmModal(this.plugin.app, "Ingest \u2014 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435", [
        `\u0424\u0430\u0439\u043B: ${file.name}`,
        "Claude \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0435\u0442 \u0444\u0430\u0439\u043B, \u0438\u0437\u0432\u043B\u0435\u0447\u0451\u0442 \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0438 \u0438 \u043E\u0431\u043D\u043E\u0432\u0438\u0442 wiki-\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0434\u043E\u043C\u0435\u043D\u0430."
      ], () => this.plugin.controller.ingestActive()).open();
    });
    this.lintBtn.addEventListener("click", () => {
      const d = this.domainSelect.value;
      const domainLabel = d ? `\xAB${d}\xBB` : "\u0432\u0441\u044F wiki";
      new ConfirmModal(this.plugin.app, "Lint \u2014 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435", [
        `\u0414\u043E\u043C\u0435\u043D: ${domainLabel}`,
        "Claude \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442 wiki-\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u043D\u0430 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u0430\u043C \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0430."
      ], () => this.plugin.controller.lint(d || "all")).open();
    });
    this.initBtn.addEventListener("click", () => {
      const d = this.domainSelect.value;
      if (!d) {
        new import_obsidian3.Notice("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0434\u043E\u043C\u0435\u043D \u0434\u043B\u044F init");
        return;
      }
      new ConfirmModal(this.plugin.app, "Init \u2014 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435", [
        `\u0414\u043E\u043C\u0435\u043D: \xAB${d}\xBB`,
        "Claude \u0441\u043E\u0437\u0434\u0430\u0441\u0442 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0443 \u043F\u0430\u043F\u043E\u043A \u0438 \u0431\u0430\u0437\u043E\u0432\u044B\u0435 wiki-\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0434\u043B\u044F \u0434\u043E\u043C\u0435\u043D\u0430."
      ], () => this.plugin.controller.init(d, false)).open();
    });
    this.refreshDomains();
    const ask = root.createDiv("llm-wiki-ask");
    this.queryInput = ask.createEl("textarea", {
      cls: "llm-wiki-query-input",
      attr: { placeholder: "\u0412\u043E\u043F\u0440\u043E\u0441 \u043F\u043E wiki\u2026 (Ctrl+Enter \u2014 \u0441\u043F\u0440\u043E\u0441\u0438\u0442\u044C, Ctrl+Shift+Enter \u2014 \u0441\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C)", rows: "3" }
    });
    const askRow = ask.createDiv("llm-wiki-ask-row");
    this.askBtn = askRow.createEl("button", { text: "\u0421\u043F\u0440\u043E\u0441\u0438\u0442\u044C" });
    this.askSaveBtn = askRow.createEl("button", { text: "\u0421\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" });
    this.cancelBtn = askRow.createEl("button", { text: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C", cls: "mod-warning" });
    this.cancelBtn.disabled = true;
    this.askBtn.addEventListener("click", () => this.submitQuery(false));
    this.askSaveBtn.addEventListener("click", () => this.submitQuery(true));
    this.cancelBtn.addEventListener("click", () => this.plugin.controller.cancelCurrent());
    this.queryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.submitQuery(e.shiftKey);
      }
    });
    const progressHeader = root.createDiv("llm-wiki-progress-header");
    const progressH4 = progressHeader.createEl("h4", { cls: "llm-wiki-progress-title" });
    this.progressToggle = progressH4.createSpan({ cls: "llm-wiki-progress-arrow", text: "\u25B6" });
    progressH4.appendText(" \u0425\u043E\u0434 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F ");
    this.progressCount = progressH4.createSpan({ cls: "llm-wiki-progress-count muted", text: "" });
    progressHeader.addEventListener("click", () => this.toggleSteps());
    this.stepsEl = root.createDiv("llm-wiki-steps");
    this.stepsEl.style.display = "none";
    root.createEl("h4", { text: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442" });
    this.finalEl = root.createDiv("llm-wiki-final");
    root.createEl("h4", { text: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F" });
    this.historyEl = root.createDiv("llm-wiki-history");
    this.renderHistory();
  }
  async onClose() {
    if (this.tickHandle !== null)
      window.clearInterval(this.tickHandle);
  }
  refreshDomains() {
    const domains = this.plugin.controller.loadDomains();
    const previous = this.domainSelect.value;
    this.domainSelect.empty();
    const allOpt = this.domainSelect.createEl("option", { value: "", text: "(\u0432\u0441\u044F \u0432\u0438\u043A\u0438)" });
    for (const d of domains) {
      this.domainSelect.createEl("option", { value: d.id, text: d.name || d.id });
    }
    if (previous && Array.from(this.domainSelect.options).some((o) => o.value === previous)) {
      this.domainSelect.value = previous;
    }
  }
  openAddDomain() {
    const cwd = this.plugin.controller.cwdOrEmpty();
    if (!cwd) {
      new import_obsidian3.Notice("cwd \u043D\u0435 \u0437\u0430\u0434\u0430\u043D");
      return;
    }
    const domains = this.plugin.controller.loadDomains();
    const wikiRoot = (() => {
      const sample = domains[0]?.wiki_folder ?? "vaults/Work/!Wiki/x";
      return sample.replace(/\/[^/]+$/, "") || "vaults/Work/!Wiki";
    })();
    new AddDomainModal(this.app, wikiRoot, (input) => {
      const r = this.plugin.controller.registerDomain(input);
      if (r.ok) {
        this.refreshDomains();
        this.domainSelect.value = input.id;
      }
    }).open();
  }
  submitQuery(save) {
    const q = this.queryInput.value.trim();
    if (!q) {
      new import_obsidian3.Notice("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u043E\u043F\u0440\u043E\u0441");
      return;
    }
    if (this.state === "running") {
      new import_obsidian3.Notice("\u0423\u0436\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F");
      return;
    }
    void this.plugin.controller.query(q, save);
    this.queryInput.value = "";
  }
  setRunning(operation, args) {
    this.state = "running";
    this.stepsEl.empty();
    this.finalEl.empty();
    this.statusEl.setText(`\u25B6 ${operation} ${args.join(" ")}`);
    this.cancelBtn.disabled = false;
    this.askBtn.disabled = true;
    this.askSaveBtn.disabled = true;
    this.ingestBtn.disabled = true;
    this.lintBtn.disabled = true;
    this.initBtn.disabled = true;
    this.startTs = Date.now();
    this.toolCount = 0;
    this.stepCount = 0;
    this.currentToolStep = null;
    this.assistantBlock = null;
    this.assistantBuffer = "";
    this.stepsOpen = true;
    this.stepsEl.style.display = "";
    this.progressToggle.setText("\u25BC");
    this.updateMetrics();
    if (this.tickHandle !== null)
      window.clearInterval(this.tickHandle);
    this.tickHandle = window.setInterval(() => this.updateMetrics(), 500);
  }
  appendEvent(ev) {
    this.stepCount++;
    if (ev.kind === "tool_use") {
      this.toolCount++;
      const step = this.stepsEl.createDiv("llm-wiki-step");
      const head = step.createDiv("llm-wiki-step-head");
      head.createSpan({ cls: "llm-wiki-step-icon" }).setText("\u{1F527}");
      head.createSpan({ cls: "llm-wiki-step-name" }).setText(ev.name);
      const summary = summariseInput(ev.input);
      if (summary)
        head.createSpan({ cls: "llm-wiki-step-arg" }).setText(summary);
      head.createSpan({ cls: "llm-wiki-step-time muted" }).setText(this.elapsedShort());
      this.currentToolStep = step;
      this.currentToolStartedAt = Date.now();
      this.scrollSteps();
    } else if (ev.kind === "tool_result") {
      const step = this.currentToolStep;
      if (step) {
        const head = step.querySelector(".llm-wiki-step-head");
        head?.addClass(ev.ok ? "ok" : "err");
        const dur = ((Date.now() - this.currentToolStartedAt) / 1e3).toFixed(1);
        const t = step.querySelector(".llm-wiki-step-time");
        if (t)
          t.setText(`${dur}s`);
        if (ev.preview) {
          const p = step.createDiv("llm-wiki-step-preview");
          p.setText(truncate(ev.preview.replace(/\s+/g, " "), PREVIEW_INLINE));
        }
        this.currentToolStep = null;
      }
    } else if (ev.kind === "assistant_text") {
      if (!this.assistantBlock) {
        this.assistantBlock = this.stepsEl.createDiv("llm-wiki-step assistant");
        this.assistantBlock.createSpan({ cls: "llm-wiki-step-icon" }).setText("\u{1F4AC}");
        this.assistantBlock.createSpan({ cls: "llm-wiki-assistant-text" });
      }
      this.assistantBuffer += ev.delta;
      const span = this.assistantBlock.querySelector(".llm-wiki-assistant-text");
      if (span)
        span.setText(truncate(this.assistantBuffer, ASSISTANT_TEXT_MAX));
      this.scrollSteps();
    } else if (ev.kind === "system") {
      const step = this.stepsEl.createDiv("llm-wiki-step");
      const head = step.createDiv("llm-wiki-step-head");
      head.createSpan({ cls: "llm-wiki-step-icon" }).setText("\u2699");
      head.createSpan({ cls: "llm-wiki-step-name muted" }).setText(translateSystemEvent(ev.message));
      this.scrollSteps();
    } else if (ev.kind === "error") {
      this.stepsEl.createDiv("llm-wiki-step err").setText(`\u2717 ${ev.message}`);
      this.scrollSteps();
    } else if (ev.kind === "result") {
      this.assistantBlock = null;
    }
    this.updateMetrics();
  }
  async finish(entry) {
    this.state = entry.status;
    this.statusEl.setText(this.statusLabel(entry));
    this.cancelBtn.disabled = true;
    this.askBtn.disabled = false;
    this.askSaveBtn.disabled = false;
    this.ingestBtn.disabled = false;
    this.lintBtn.disabled = false;
    this.initBtn.disabled = false;
    if (this.tickHandle !== null) {
      window.clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.stepsOpen = false;
    this.stepsEl.style.display = "none";
    this.progressToggle.setText("\u25B6");
    this.updateMetrics();
    this.finalEl.empty();
    if (entry.finalText) {
      const comp = new import_obsidian3.Component();
      comp.load();
      await import_obsidian3.MarkdownRenderer.render(this.app, entry.finalText, this.finalEl, this.plugin.controller.cwdOrEmpty(), comp);
    }
    this.renderHistory();
  }
  toggleSteps() {
    this.stepsOpen = !this.stepsOpen;
    this.stepsEl.style.display = this.stepsOpen ? "" : "none";
    this.progressToggle.setText(this.stepsOpen ? "\u25BC" : "\u25B6");
  }
  updateMetrics() {
    if (this.state !== "running") {
      this.progressCount.setText("");
      return;
    }
    const dur = ((Date.now() - this.startTs) / 1e3).toFixed(1);
    this.progressCount.setText(`${this.stepCount} \u0448\u0430\u0433\u043E\u0432 \xB7 ${dur}s`);
  }
  elapsedShort() {
    return `${((Date.now() - this.startTs) / 1e3).toFixed(1)}s`;
  }
  scrollSteps() {
    this.stepsEl.scrollTop = this.stepsEl.scrollHeight;
  }
  statusLabel(entry) {
    const dur = ((entry.finishedAt - entry.startedAt) / 1e3).toFixed(1);
    const icon = entry.status === "done" ? "\u2713" : entry.status === "cancelled" ? "\u26D4" : "\u2717";
    return `${icon} ${entry.operation} (${dur}s)`;
  }
  renderHistory() {
    this.historyEl.empty();
    const items = this.plugin.settings.history.slice().reverse();
    for (const it of items) {
      const row = this.historyEl.createDiv("llm-wiki-history-row");
      row.createSpan().setText(this.statusLabel(it));
      row.createSpan({ cls: "muted" }).setText(` ${it.args.join(" ")}`);
      row.addEventListener("click", () => {
        this.finalEl.empty();
        const comp = new import_obsidian3.Component();
        comp.load();
        import_obsidian3.MarkdownRenderer.render(this.app, it.finalText || "(\u043F\u0443\u0441\u0442\u043E)", this.finalEl, this.plugin.controller.cwdOrEmpty(), comp);
      });
    }
    if (items.length === 0) {
      this.historyEl.createDiv("muted").setText("\u0418\u0441\u0442\u043E\u0440\u0438\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.");
    }
  }
};
function summariseInput(input) {
  if (!input || typeof input !== "object")
    return "";
  const o = input;
  const candidates = [
    ["file_path"],
    ["path"],
    ["pattern"],
    ["query"],
    ["command"],
    ["url"],
    ["notebook_path"]
  ];
  for (const [k] of candidates) {
    const v = o[k];
    if (typeof v === "string" && v)
      return truncate(v, 80);
  }
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === "string" && v)
      return `${k}=${truncate(v, 60)}`;
  }
  return "";
}
function truncate(s, n) {
  return s.length <= n ? s : s.slice(0, n) + "\u2026";
}
function translateSystemEvent(message) {
  if (message === "hook_started")
    return "\u0417\u0430\u043F\u0443\u0441\u043A";
  if (message === "hook_response")
    return "\u0418\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F";
  if (message.startsWith("init")) {
    const model = message.replace(/^init\s*/, "").replace(/[()]/g, "").trim();
    return model ? `\u0418\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F (${model})` : "\u0418\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F";
  }
  return message;
}

// src/controller.ts
var import_obsidian4 = require("obsidian");
var import_node_fs2 = require("node:fs");
var import_node_path3 = require("node:path");

// src/runner.ts
var import_node_child_process = require("node:child_process");
var import_node_readline = require("node:readline");

// src/stream.ts
var PREVIEW_MAX = 200;
function parseStreamLine(raw) {
  const trimmed = raw.trim();
  if (!trimmed)
    return null;
  if (!trimmed.startsWith("{"))
    return null;
  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return { kind: "error", message: `stream parse error: ${truncate2(trimmed, 120)}` };
  }
  if (!obj || typeof obj !== "object")
    return null;
  switch (obj.type) {
    case "system": {
      const msg = `${obj.subtype ?? "system"}${obj.model ? ` (${obj.model})` : ""}`;
      return { kind: "system", message: msg };
    }
    case "assistant":
      return mapAssistant(obj);
    case "user":
      return mapUserToolResult(obj);
    case "result":
      return mapResult(obj);
    default:
      return null;
  }
}
function mapAssistant(obj) {
  const content = obj.message?.content;
  if (!Array.isArray(content) || content.length === 0)
    return null;
  const block = content[0];
  if (block?.type === "tool_use") {
    return { kind: "tool_use", name: String(block.name ?? "?"), input: block.input };
  }
  if (block?.type === "text") {
    return { kind: "assistant_text", delta: String(block.text ?? "") };
  }
  return null;
}
function mapUserToolResult(obj) {
  const block = obj.message?.content?.[0];
  if (block?.type !== "tool_result")
    return null;
  const isErr = Boolean(block.is_error);
  const preview = typeof block.content === "string" ? truncate2(block.content, PREVIEW_MAX) : void 0;
  return { kind: "tool_result", ok: !isErr, preview };
}
function mapResult(obj) {
  if (obj.is_error || obj.subtype === "error") {
    return { kind: "error", message: String(obj.result ?? obj.error ?? "claude error") };
  }
  return {
    kind: "result",
    durationMs: Number(obj.duration_ms ?? 0),
    usdCost: typeof obj.total_cost_usd === "number" ? obj.total_cost_usd : void 0,
    text: String(obj.result ?? "")
  };
}
function truncate2(s, n) {
  return s.length <= n ? s : s.slice(0, n) + "\u2026";
}

// src/prompt.ts
var QUOTED_OPS = ["ingest", "query", "query-save"];
function buildPrompt({ operation, args }) {
  for (const a of args) {
    if (a.includes("\n") || a.includes("\r")) {
      throw new Error("Argument contains newline character \u2014 refusing to build prompt");
    }
    if (a.includes("\\")) {
      throw new Error("Argument contains backslash \u2014 refusing to build prompt");
    }
  }
  if (operation === "query-save") {
    const [question, ...rest] = args;
    if (!question)
      throw new Error("query-save requires a question argument");
    return `/llm-wiki query "${escapeQuotes(question)}"${rest.map(formatTail).join("")} --save`;
  }
  if (QUOTED_OPS.includes(operation)) {
    const [primary, ...rest] = args;
    if (!primary)
      throw new Error(`${operation} requires a primary argument`);
    const op = operation === "query-save" ? "query" : operation;
    return `/llm-wiki ${op} "${escapeQuotes(primary)}"${rest.map(formatTail).join("")}`;
  }
  const tail = args.length > 0 ? " " + args.join(" ") : "";
  return `/llm-wiki ${operation}${tail}`;
}
function escapeQuotes(s) {
  return s.replace(/"/g, '\\"');
}
function formatTail(arg) {
  return arg.startsWith("--") ? ` ${arg}` : ` "${escapeQuotes(arg)}"`;
}

// src/runner.ts
var STDERR_BUFFER_BYTES = 64 * 1024;
var SIGTERM_GRACE_MS = 3e3;
var IclaudeRunner = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  async *run(req) {
    const prompt = buildPrompt({ operation: req.operation, args: req.args });
    const claudeArgs = [
      "--",
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--allowed-tools",
      this.cfg.allowedTools.join(",")
    ];
    if (this.cfg.model)
      claudeArgs.push("--model", this.cfg.model);
    const args = this.cfg.extraArgsForFixture ? [...this.cfg.extraArgsForFixture] : claudeArgs;
    const child = (0, import_node_child_process.spawn)(this.cfg.iclaudePath, args, {
      cwd: req.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stderrBuf = [];
    let stderrBytes = 0;
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      stderrBuf.push(chunk);
      while (stderrBytes > STDERR_BUFFER_BYTES && stderrBuf.length > 1) {
        const dropped = stderrBuf.shift();
        stderrBytes -= dropped.length;
      }
    });
    const onAbort = () => {
      if (child.exitCode !== null)
        return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null)
          child.kill("SIGKILL");
      }, SIGTERM_GRACE_MS);
    };
    if (req.signal.aborted)
      onAbort();
    else
      req.signal.addEventListener("abort", onAbort, { once: true });
    const timeoutHandle = setTimeout(() => {
      if (child.exitCode === null)
        child.kill("SIGTERM");
    }, req.timeoutMs);
    const queue = [];
    let resolveNext = null;
    const wake = () => {
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };
    const rl = (0, import_node_readline.createInterface)({ input: child.stdout });
    rl.on("line", (line) => {
      const ev = parseStreamLine(line);
      if (ev)
        queue.push(ev);
      wake();
    });
    let exited = false;
    let exitCode = 0;
    child.on("error", (err) => {
      queue.push({ kind: "error", message: `spawn error: ${err.message}` });
      exited = true;
      exitCode = -1;
      wake();
    });
    child.on("close", (code) => {
      if (stderrBuf.length > 0 && code !== 0) {
        const tail = Buffer.concat(stderrBuf).toString("utf-8").slice(-4096);
        queue.push({ kind: "error", message: `stderr: ${tail}` });
      }
      exited = true;
      exitCode = code ?? -1;
      wake();
    });
    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift();
          continue;
        }
        if (exited)
          break;
        await new Promise((r) => resolveNext = r);
      }
      yield { kind: "exit", code: exitCode };
    } finally {
      clearTimeout(timeoutHandle);
      req.signal.removeEventListener("abort", onAbort);
      rl.close();
    }
  }
};

// src/domain-map.ts
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");
function domainMapPath(skillPath, vaultName) {
  return (0, import_node_path2.join)(skillPath, "shared", `domain-map-${vaultName}.json`);
}
function readDomains(skillPath, vaultName) {
  const p = domainMapPath(skillPath, vaultName);
  if (!(0, import_node_fs.existsSync)(p))
    return [];
  try {
    const data = JSON.parse((0, import_node_fs.readFileSync)(p, "utf-8"));
    return (data.domains ?? []).map((d) => ({
      id: d.id,
      name: d.name ?? d.id,
      wiki_folder: d.wiki_folder ?? "",
      source_paths: d.source_paths ?? []
    }));
  } catch {
    return [];
  }
}
function addDomain(skillPath, vaultName, repoRoot, input) {
  const id = input.id.trim();
  if (!id)
    return { ok: false, error: "ID \u0434\u043E\u043C\u0435\u043D\u0430 \u043F\u0443\u0441\u0442" };
  if (!/^[\p{L}\p{N}_\-]+$/u.test(id))
    return { ok: false, error: "ID \u0434\u043E\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0431\u0443\u043A\u0432\u044B/\u0446\u0438\u0444\u0440\u044B/_/-" };
  const p = domainMapPath(skillPath, vaultName);
  const sharedDir = (0, import_node_path2.join)(skillPath, "shared");
  let data;
  if (!(0, import_node_fs.existsSync)(p)) {
    (0, import_node_fs.mkdirSync)(sharedDir, { recursive: true });
    data = {
      vault: vaultName,
      wiki_root: `vaults/${vaultName}/!Wiki`,
      domains: []
    };
  } else {
    try {
      data = JSON.parse((0, import_node_fs.readFileSync)(p, "utf-8"));
    } catch (err) {
      return { ok: false, error: `\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0439 JSON: ${err.message}` };
    }
  }
  if (!Array.isArray(data.domains))
    data.domains = [];
  if (data.domains.some((d) => d.id === id))
    return { ok: false, error: `\u0414\u043E\u043C\u0435\u043D \xAB${id}\xBB \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442` };
  const wikiFolderRel = input.wikiFolder.trim() || `${data.wiki_root ?? `vaults/${vaultName}/!Wiki`}/${id}`;
  data.domains.push({
    id,
    name: input.name.trim() || id,
    wiki_folder: wikiFolderRel,
    source_paths: input.sourcePaths.map((s) => s.trim()).filter(Boolean),
    entity_types: [],
    tags: [],
    language_notes: ""
  });
  try {
    (0, import_node_fs.writeFileSync)(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } catch (err) {
    return { ok: false, error: `\u0417\u0430\u043F\u0438\u0441\u044C JSON: ${err.message}` };
  }
  if (repoRoot) {
    try {
      (0, import_node_fs.mkdirSync)((0, import_node_path2.join)(repoRoot, wikiFolderRel), { recursive: true });
    } catch {
    }
  }
  return { ok: true };
}

// src/controller.ts
var WikiController = class {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }
  current = null;
  /** Путь к папке навыка (для UI: проверка "задан ли путь"). */
  cwdOrEmpty() {
    return resolveSkillPath(this.plugin.settings) ?? "";
  }
  isBusy() {
    return this.current !== null;
  }
  cancelCurrent() {
    if (this.current) {
      this.current.abort();
      new import_obsidian4.Notice("\u041E\u0442\u043C\u0435\u043D\u0430\u2026");
    }
  }
  async ingestActive() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new import_obsidian4.Notice("\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430");
      return;
    }
    const abs = this.app.vault.adapter.getFullPath(file.path);
    const spawnCwd = resolveCwd(this.plugin.settings);
    let filePath;
    if (spawnCwd) {
      const rel = (0, import_node_path3.relative)(spawnCwd, abs);
      filePath = rel.startsWith("..") || (0, import_node_path3.isAbsolute)(rel) ? abs : rel;
    } else {
      filePath = abs;
    }
    await this.dispatch("ingest", [filePath]);
  }
  async query(question, save) {
    if (!question.trim())
      return;
    const op = save ? "query-save" : "query";
    await this.dispatch(op, [question.trim()]);
  }
  async lint(domain) {
    const args = domain === "all" ? [] : [domain];
    await this.dispatch("lint", args);
  }
  async init(domain, dryRun) {
    const args = dryRun ? [domain, "--dry-run"] : [domain];
    await this.dispatch("init", args);
  }
  /** Список доменов из domain-map-<vault>.json. Пустой массив, если путь к навыку не задан. */
  loadDomains() {
    const sp = resolveSkillPath(this.plugin.settings);
    if (!sp)
      return [];
    return readDomains(sp, this.app.vault.getName());
  }
  registerDomain(input) {
    const sp = this.requireSkillPath();
    if (!sp)
      return { ok: false, error: "\u043F\u0443\u0442\u044C \u043A \u043D\u0430\u0432\u044B\u043A\u0443 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D" };
    const repoRoot = resolveCwd(this.plugin.settings) ?? "";
    const r = addDomain(sp, this.app.vault.getName(), repoRoot, input);
    if (r.ok)
      new import_obsidian4.Notice(`\u0414\u043E\u043C\u0435\u043D \xAB${input.id}\xBB \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D`);
    else
      new import_obsidian4.Notice(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0434\u043E\u043C\u0435\u043D: ${r.error}`);
    return r;
  }
  requireSkillPath() {
    const sp = resolveSkillPath(this.plugin.settings);
    if (!sp) {
      new import_obsidian4.Notice("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0443\u0442\u044C \u043A \u043D\u0430\u0432\u044B\u043A\u0443 llm-wiki \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445");
      return null;
    }
    if (!(0, import_node_fs2.existsSync)(sp)) {
      new import_obsidian4.Notice(`\u041F\u0430\u043F\u043A\u0430 \u043D\u0430\u0432\u044B\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430: ${sp}`);
      return null;
    }
    return sp;
  }
  requireIclaude() {
    const p = this.plugin.settings.iclaudePath;
    if (!p) {
      new import_obsidian4.Notice("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0443\u0442\u044C \u043A Claude Code \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445");
      return null;
    }
    if (!(0, import_node_fs2.existsSync)(p)) {
      new import_obsidian4.Notice(`Claude Code \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D: ${p}`);
      return null;
    }
    try {
      (0, import_node_fs2.statSync)(p);
    } catch {
      new import_obsidian4.Notice(`Claude Code \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: ${p}`);
      return null;
    }
    return p;
  }
  async dispatch(op, args) {
    if (this.isBusy()) {
      new import_obsidian4.Notice("\u0423\u0436\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044F, \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435 \u0435\u0451 \u0441\u043D\u0430\u0447\u0430\u043B\u0430");
      return;
    }
    if (!this.requireSkillPath())
      return;
    const iclaudePath = this.requireIclaude();
    if (!iclaudePath)
      return;
    await this.ensureView();
    const view = this.activeView();
    if (!view)
      return;
    const ctrl = new AbortController();
    this.current = ctrl;
    const startedAt = Date.now();
    const steps = [];
    let finalText = "";
    let status = "done";
    view.setRunning(op, args);
    const spawnCwd = resolveCwd(this.plugin.settings) ?? void 0;
    const timeoutMs = this.plugin.settings.timeouts[op === "query-save" ? "query" : op] * 1e3;
    const runner = new IclaudeRunner({
      iclaudePath,
      allowedTools: this.plugin.settings.allowedTools,
      model: this.plugin.settings.model
    });
    try {
      for await (const ev of runner.run({ operation: op, args, cwd: spawnCwd, signal: ctrl.signal, timeoutMs })) {
        view.appendEvent(ev);
        this.collectStep(ev, steps);
        if (ev.kind === "result")
          finalText = ev.text;
        if (ev.kind === "error")
          status = "error";
        if (ev.kind === "exit") {
          if (ev.code !== 0 && status === "done")
            status = "error";
          if (ctrl.signal.aborted)
            status = "cancelled";
        }
      }
    } catch (err) {
      status = "error";
      finalText = `\u041E\u0448\u0438\u0431\u043A\u0430: ${err.message}`;
    } finally {
      this.current = null;
    }
    const entry = {
      id: `${startedAt}`,
      operation: op,
      args,
      startedAt,
      finishedAt: Date.now(),
      status,
      finalText,
      steps
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
        if (pathInVault)
          await this.app.workspace.openLinkText(pathInVault, "");
      }
    }
  }
  collectStep(ev, steps) {
    if (ev.kind === "tool_use") {
      const inp = ev.input ?? {};
      steps.push({ kind: "tool_use", label: `${ev.name} ${inp.file_path ?? inp.pattern ?? ""}`.trim() });
    } else if (ev.kind === "tool_result") {
      steps.push({ kind: "tool_result", label: ev.ok ? "ok" : "error" });
    }
  }
  async ensureView() {
    const leaves = this.app.workspace.getLeavesOfType(LLM_WIKI_VIEW_TYPE);
    if (leaves.length === 0) {
      const right = this.app.workspace.getRightLeaf(false);
      if (right)
        await right.setViewState({ type: LLM_WIKI_VIEW_TYPE, active: true });
    } else {
      this.app.workspace.revealLeaf(leaves[0]);
    }
  }
  activeView() {
    const leaves = this.app.workspace.getLeavesOfType(LLM_WIKI_VIEW_TYPE);
    const view = leaves[0]?.view;
    return view instanceof LlmWikiView ? view : null;
  }
  async toVaultPath(spawnCwd, savedPath) {
    const vaultDir = this.app.vault.adapter.getBasePath?.() ?? "";
    const abs = (0, import_node_path3.isAbsolute)(savedPath) ? savedPath : (0, import_node_path3.join)(spawnCwd ?? vaultDir, savedPath);
    const rel = (0, import_node_path3.relative)(vaultDir, abs);
    if (rel.startsWith("..") || (0, import_node_path3.isAbsolute)(rel))
      return null;
    const file = this.app.vault.getAbstractFileByPath(rel);
    return file instanceof import_obsidian4.TFile ? rel : rel;
  }
};

// src/main.ts
var LlmWikiPlugin = class extends import_obsidian5.Plugin {
  settings;
  controller;
  async onload() {
    await this.loadSettings();
    this.controller = new WikiController(this.app, this);
    this.registerView(LLM_WIKI_VIEW_TYPE, (leaf) => new LlmWikiView(leaf, this));
    this.addRibbonIcon("brain-circuit", "LLM Wiki", () => {
      const leaves = this.app.workspace.getLeavesOfType(LLM_WIKI_VIEW_TYPE);
      if (leaves.length > 0) {
        this.app.workspace.revealLeaf(leaves[0]);
      } else {
        const right = this.app.workspace.getRightLeaf(false);
        if (right)
          void right.setViewState({ type: LLM_WIKI_VIEW_TYPE, active: true });
      }
    });
    this.addCommand({
      id: "open-panel",
      name: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C",
      callback: () => {
        const right = this.app.workspace.getRightLeaf(false);
        if (right)
          void right.setViewState({ type: LLM_WIKI_VIEW_TYPE, active: true });
      }
    });
    this.addCommand({
      id: "ingest-current",
      name: "Ingest \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430",
      callback: () => void this.controller.ingestActive()
    });
    this.addCommand({
      id: "query",
      name: "Query (\u0432\u043E\u043F\u0440\u043E\u0441)",
      callback: () => new QueryModal(this.app, false, (q) => void this.controller.query(q, false)).open()
    });
    this.addCommand({
      id: "query-save",
      name: "Query + \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043A\u0430\u043A \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443",
      callback: () => new QueryModal(this.app, true, (q) => void this.controller.query(q, true)).open()
    });
    this.addCommand({
      id: "lint",
      name: "Lint \u0434\u043E\u043C\u0435\u043D\u0430",
      callback: () => {
        const domains = this.controller.loadDomains();
        new DomainModal(
          this.app,
          "Lint",
          true,
          null,
          domains,
          (d) => void this.controller.lint(d)
        ).open();
      }
    });
    this.addCommand({
      id: "init",
      name: "Init \u0434\u043E\u043C\u0435\u043D\u0430",
      callback: () => {
        const domains = this.controller.loadDomains();
        new DomainModal(
          this.app,
          "Init",
          false,
          { dryRun: true },
          domains,
          (d, f) => void this.controller.init(d, f.dryRun ?? false)
        ).open();
      }
    });
    this.addCommand({
      id: "cancel",
      name: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044E",
      callback: () => this.controller.cancelCurrent()
    });
    this.addSettingTab(new LlmWikiSettingTab(this.app, this));
    console.log("[llm-wiki] loaded");
  }
  async onunload() {
    this.controller.cancelCurrent();
    console.log("[llm-wiki] unloaded");
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data ?? {},
      timeouts: { ...DEFAULT_SETTINGS.timeouts, ...data?.timeouts ?? {} },
      allowedTools: data?.allowedTools ?? DEFAULT_SETTINGS.allowedTools,
      history: data?.history ?? []
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
