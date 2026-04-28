import { App, PluginSettingTab, Setting, Platform } from "obsidian";
import { resolve } from "node:path";
import type LlmWikiPlugin from "./main";
import { MODEL_PRESETS } from "./types";
import type { LlmWikiPluginSettings } from "./types";

export class LlmWikiSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LlmWikiPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl).setName("LLM Wiki").setHeading();

    new Setting(containerEl)
      .setName("Backend")
      .setDesc("Choose the backend for running operations.")
      .addDropdown((d) =>
        d
          .addOption("claude-code", "Claude Code")
          .addOption("native-agent", "Native Agent (OpenAI-compatible)")
          .setValue(s.backend)
          .onChange(async (v) => {
            s.backend = v as "claude-code" | "native-agent";
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (s.backend === "claude-code") {
      new Setting(containerEl)
        .setName("Claude Code path")
        .setDesc("Required. Absolute path to iclaude.sh / iclaude / claude.")
        .addText((t) =>
          t.setPlaceholder("/home/user/Documents/Project/iclaude/iclaude.sh")
            .setValue(s.iclaudePath)
            .onChange(async (v) => { s.iclaudePath = v.trim(); await this.plugin.saveSettings(); }),
        );

      new Setting(containerEl)
        .setName("LLM Wiki skill path")
        .setDesc("Required. Absolute path to the skill folder (contains shared/domain-map.json).")
        .addText((t) =>
          t.setPlaceholder("/home/user/Documents/Project/iclaude/.nvm-isolated/.claude-isolated/skills/llm-wiki")
            .setValue(s.cwd)
            .onChange(async (v) => { s.cwd = v.trim(); await this.plugin.saveSettings(); }),
        );

      new Setting(containerEl)
        .setName("Allowed tools")
        .setDesc("Comma-separated list. Default: Read,Edit,Write,Glob,Grep")
        .addText((t) =>
          t.setValue(s.allowedTools.join(","))
            .onChange(async (v) => {
              s.allowedTools = v.split(",").map((x) => x.trim()).filter(Boolean);
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Model")
        .setDesc("Passed to claude as --model. Use a preset or enter a custom ID (e.g. claude-opus-4-7).")
        .addDropdown((d) => {
          for (const p of MODEL_PRESETS) d.addOption(p.value, p.label);
          if (s.model && !MODEL_PRESETS.some((p) => p.value === s.model)) {
            d.addOption(s.model, s.model);
          }
          d.setValue(s.model);
          d.onChange(async (v) => { s.model = v; await this.plugin.saveSettings(); });
        })
        .addText((t) =>
          t.setPlaceholder("custom: claude-opus-4-7")
            .setValue(MODEL_PRESETS.some((p) => p.value === s.model) ? "" : s.model)
            .onChange(async (v) => {
              const trimmed = v.trim();
              if (trimmed) { s.model = trimmed; await this.plugin.saveSettings(); }
            }),
        );

      new Setting(containerEl)
        .setName("Timeouts (seconds)")
        .setDesc("ingest / query / lint / init")
        .addText((t) =>
          t.setValue(`${s.timeouts.ingest}/${s.timeouts.query}/${s.timeouts.lint}/${s.timeouts.init}`)
            .onChange(async (v) => {
              const parts = v.split("/").map((x) => Number(x.trim()));
              if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n > 0)) {
                s.timeouts = { ingest: parts[0], query: parts[1], lint: parts[2], init: parts[3] };
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("Show raw JSON in panel")
        .addToggle((t) =>
          t.setValue(s.showRawJson)
            .onChange(async (v) => { s.showRawJson = v; await this.plugin.saveSettings(); }),
        );

      if (Platform.isMobile) {
        containerEl.createEl("p", { text: "⚠ Mobile is not supported (no child_process)." });
      }
    } else {
      new Setting(containerEl)
        .setName("Base URL")
        .setDesc("OpenAI-compatible endpoint. Ollama: http://localhost:11434/v1")
        .addText((t) =>
          t
            .setPlaceholder("http://localhost:11434/v1")
            .setValue(s.nativeAgent.baseUrl)
            .onChange(async (v) => {
              s.nativeAgent.baseUrl = v.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("API Key")
        .setDesc('For Ollama enter "ollama". For OpenAI — key sk-...')
        .addText((t) =>
          t
            .setPlaceholder("ollama")
            .setValue(s.nativeAgent.apiKey)
            .onChange(async (v) => {
              s.nativeAgent.apiKey = v.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Model")
        .setDesc("Model name: llama3.2, mistral, gpt-4o, etc.")
        .addText((t) =>
          t
            .setPlaceholder("llama3.2")
            .setValue(s.nativeAgent.model)
            .onChange(async (v) => {
              s.nativeAgent.model = v.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Temperature")
        .setDesc("0.0–1.0. Low (0.1–0.3) — factual, high — creative.")
        .addText((t) =>
          t
            .setPlaceholder("0.2")
            .setValue(String(s.nativeAgent.temperature))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n >= 0 && n <= 2) {
                s.nativeAgent.temperature = n;
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("Max tokens")
        .setDesc("Max tokens in response. For wiki pages ≥ 4096 recommended.")
        .addText((t) =>
          t
            .setPlaceholder("4096")
            .setValue(String(s.nativeAgent.maxTokens))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) {
                s.nativeAgent.maxTokens = Math.floor(n);
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("Top-p")
        .setDesc("0.0–1.0, or empty to disable. Alternative to temperature (nucleus sampling).")
        .addText((t) =>
          t
            .setPlaceholder("(отключено)")
            .setValue(s.nativeAgent.topP != null ? String(s.nativeAgent.topP) : "")
            .onChange(async (v) => {
              const trimmed = v.trim();
              if (!trimmed) {
                s.nativeAgent.topP = null;
              } else {
                const n = Number(trimmed);
                if (Number.isFinite(n) && n >= 0 && n <= 1) s.nativeAgent.topP = n;
              }
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Request timeout (s)")
        .setDesc("HTTP request timeout for the LLM. For Ollama on large models 300+ recommended.")
        .addText((t) =>
          t
            .setPlaceholder("300")
            .setValue(String(s.nativeAgent.requestTimeoutSec))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) {
                s.nativeAgent.requestTimeoutSec = Math.floor(n);
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("num_ctx (Ollama)")
        .setDesc("Model context size. Ollama only. Empty — use model default.")
        .addText((t) =>
          t
            .setPlaceholder("(дефолт модели)")
            .setValue(s.nativeAgent.numCtx != null ? String(s.nativeAgent.numCtx) : "")
            .onChange(async (v) => {
              const trimmed = v.trim();
              if (!trimmed) {
                s.nativeAgent.numCtx = null;
              } else {
                const n = Number(trimmed);
                if (Number.isFinite(n) && n > 0) s.nativeAgent.numCtx = Math.floor(n);
              }
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("System prompt")
        .setDesc("Prepended to the system prompt for every operation. Overrides the default when set.")
        .addTextArea((t) => {
          t.inputEl.style.minHeight = "96px";
          t.inputEl.style.width = "100%";
          t
            .setValue(s.nativeAgent.systemPrompt)
            .onChange(async (v) => {
              s.nativeAgent.systemPrompt = v;
              await this.plugin.saveSettings();
            });
          return t;
        });

      new Setting(containerEl)
        .setName("Domain map folder")
        .setDesc("Where to store domain-map-<vault>.json. Empty — auto: <vault>/.obsidian/plugins/llm-wiki/")
        .addText((t) =>
          t
            .setPlaceholder("(авто)")
            .setValue(s.nativeAgent.domainMapDir)
            .onChange(async (v) => {
              s.nativeAgent.domainMapDir = v.trim();
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName("History limit")
      .setDesc("Maximum operations kept in sidebar history.")
      .addText((t) =>
        t.setValue(String(s.historyLimit))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) { s.historyLimit = Math.floor(n); await this.plugin.saveSettings(); }
          }),
      );

    new Setting(containerEl)
      .setName("Agent log (JSONL)")
      .setDesc("Absolute path to the log file. Each RunEvent written as one JSON line. Empty — logging disabled.")
      .addText((t) =>
        t
          .setPlaceholder("/tmp/llm-wiki-agent.jsonl")
          .setValue(s.agentLogPath)
          .onChange(async (v) => { s.agentLogPath = v.trim(); await this.plugin.saveSettings(); }),
      );
  }
}

/** Полный путь к папке навыка, как введён пользователем. Null = использовать глобальную установку. */
export function resolveSkillPath(settings: LlmWikiPluginSettings): string | null {
  return settings.cwd || null;
}

/** Рабочая директория для spawn = 3 уровня вверх от папки навыка. Null = глобальный режим. */
export function resolveCwd(settings: LlmWikiPluginSettings): string | null {
  if (!settings.cwd) return null;
  return resolve(settings.cwd, "../../..");
}
