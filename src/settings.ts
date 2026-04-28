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

    containerEl.createEl("h2", { text: "LLM Wiki" });

    new Setting(containerEl)
      .setName("Путь к Claude Code")
      .setDesc("Обязательно. Полный абсолютный путь к iclaude.sh / iclaude / claude.")
      .addText((t) =>
        t.setPlaceholder("/home/user/Documents/Project/iclaude/iclaude.sh")
          .setValue(s.iclaudePath)
          .onChange(async (v) => { s.iclaudePath = v.trim(); await this.plugin.saveSettings(); }),
      );

    new Setting(containerEl)
      .setName("Путь к навыку llm-wiki")
      .setDesc("Обязательно. Полный абсолютный путь к папке навыка (содержит shared/domain-map.json).")
      .addText((t) =>
        t.setPlaceholder("/home/user/Documents/Project/iclaude/.nvm-isolated/.claude-isolated/skills/llm-wiki")
          .setValue(s.cwd)
          .onChange(async (v) => { s.cwd = v.trim(); await this.plugin.saveSettings(); }),
      );

    new Setting(containerEl)
      .setName("Allowed tools")
      .setDesc("Список через запятую. По умолчанию: Read,Edit,Write,Glob,Grep")
      .addText((t) =>
        t.setValue(s.allowedTools.join(","))
          .onChange(async (v) => {
            s.allowedTools = v.split(",").map((x) => x.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Модель")
      .setDesc("Передаётся claude как --model. Пресет, либо введите произвольный ID (claude-opus-4-7 и т.п.).")
      .addDropdown((d) => {
        for (const p of MODEL_PRESETS) d.addOption(p.value, p.label);
        // Если в настройках сохранён кастомный ID, добавим его как доп. опцию.
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
      .setName("Лимит истории")
      .addText((t) =>
        t.setValue(String(s.historyLimit))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) { s.historyLimit = Math.floor(n); await this.plugin.saveSettings(); }
          }),
      );

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
      .setName("Показывать raw JSON в панели")
      .addToggle((t) =>
        t.setValue(s.showRawJson)
          .onChange(async (v) => { s.showRawJson = v; await this.plugin.saveSettings(); }),
      );

    if (Platform.isMobile) {
      containerEl.createEl("p", { text: "⚠ Mobile не поддерживается (нет child_process)." });
    }

    containerEl.createEl("h2", { text: "Native Agent (beta)" });

    new Setting(containerEl)
      .setName("Backend")
      .setDesc('Выберите "native-agent" для использования Ollama/OpenAI напрямую без Claude Code.')
      .addDropdown((d) =>
        d
          .addOption("claude-code", "Claude Code (iclaude.sh)")
          .addOption("native-agent", "Native Agent (OpenAI-compatible)")
          .setValue(s.backend)
          .onChange(async (v) => {
            s.backend = v as "claude-code" | "native-agent";
            await this.plugin.saveSettings();
          }),
      );

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
      .setName("Model")
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
