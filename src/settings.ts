import { App, PluginSettingTab, Setting } from "obsidian";
import type LlmWikiPlugin from "./main";
import type { LlmWikiPluginSettings } from "./types";

export class LlmWikiSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LlmWikiPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    containerEl.createEl("h2", { text: "LLM Wiki" });

    containerEl.createEl("h3", { text: "Общие настройки" });

    new Setting(containerEl)
      .setName("System prompt")
      .setDesc("Системный промт для всех операций. Используется обоими бэкендами.")
      .addTextArea((t) => {
        t.inputEl.style.minHeight = "96px";
        t.inputEl.style.width = "100%";
        t
          .setValue(s.systemPrompt)
          .onChange(async (v) => {
            s.systemPrompt = v;
            await this.plugin.saveSettings();
          });
        return t;
      });

    new Setting(containerEl)
      .setName("Backend")
      .setDesc("Выберите бэкенд для выполнения операций.")
      .addDropdown((d) =>
        d
          .addOption("claude-agent", "Claude Code Agent")
          .addOption("native-agent", "Native Agent (OpenAI-compatible)")
          .setValue(s.backend)
          .onChange(async (v) => {
            s.backend = v as LlmWikiPluginSettings["backend"];
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    containerEl.createEl("h3", { text: "Настройки бэкенда" });

    if (s.backend === "claude-agent") {
      new Setting(containerEl)
        .setName("Путь к Claude Code")
        .setDesc("Обязательно. Полный абсолютный путь к iclaude.sh / iclaude / claude.")
        .addText((t) =>
          t
            .setPlaceholder("/home/user/Documents/Project/iclaude/iclaude.sh")
            .setValue(s.claudeAgent.iclaudePath)
            .onChange(async (v) => {
              s.claudeAgent.iclaudePath = v.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Модель")
        .setDesc("Имя модели: sonnet, opus, claude-sonnet-4-6 и т.п. Пусто — дефолт claude.")
        .addText((t) =>
          t
            .setPlaceholder("sonnet")
            .setValue(s.claudeAgent.model)
            .onChange(async (v) => {
              s.claudeAgent.model = v.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Max tokens")
        .setDesc("Максимум токенов в ответе. Рекомендуется ≥ 4096.")
        .addText((t) =>
          t
            .setPlaceholder("4096")
            .setValue(String(s.claudeAgent.maxTokens))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) {
                s.claudeAgent.maxTokens = Math.floor(n);
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("Request timeout (сек)")
        .setDesc("Таймаут subprocess. Рекомендуется 300+.")
        .addText((t) =>
          t
            .setPlaceholder("300")
            .setValue(String(s.claudeAgent.requestTimeoutSec))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) {
                s.claudeAgent.requestTimeoutSec = Math.floor(n);
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("Папка domain-map")
        .setDesc("Где хранить domain-map-<vault>.json. Пусто — авто: <vault>/.obsidian/plugins/obsidian-llm-wiki/")
        .addText((t) =>
          t
            .setPlaceholder("(авто)")
            .setValue(s.claudeAgent.domainMapDir)
            .onChange(async (v) => {
              s.claudeAgent.domainMapDir = v.trim();
              await this.plugin.saveSettings();
            }),
        );
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
        .setDesc('Для Ollama введите "ollama". Для OpenAI — ключ sk-...')
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
        .setName("Модель")
        .setDesc("Имя модели: llama3.2, mistral, gpt-4o и т.п.")
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
        .setDesc("0.0–1.0.")
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
        .setDesc("Максимум токенов в ответе.")
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
        .setDesc("0.0–1.0, или пусто — отключить.")
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
        .setName("Request timeout (сек)")
        .setDesc("Таймаут HTTP-запроса к LLM.")
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
        .setDesc("Размер контекста. Пусто — дефолт модели.")
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
        .setName("Папка domain-map")
        .setDesc("Где хранить domain-map-<vault>.json. Пусто — авто: <vault>/.obsidian/plugins/obsidian-llm-wiki/")
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
      .setName("Таймауты (секунды)")
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
      .setName("Лимит истории")
      .setDesc("Максимум операций в истории боковой панели.")
      .addText((t) =>
        t.setValue(String(s.historyLimit))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) { s.historyLimit = Math.floor(n); await this.plugin.saveSettings(); }
          }),
      );

    new Setting(containerEl)
      .setName("Лог агента (JSONL)")
      .setDesc("Абсолютный путь к файлу лога. Пусто — отключено.")
      .addText((t) =>
        t
          .setPlaceholder("/tmp/llm-wiki-agent.jsonl")
          .setValue(s.agentLogPath)
          .onChange(async (v) => { s.agentLogPath = v.trim(); await this.plugin.saveSettings(); }),
      );
  }
}
