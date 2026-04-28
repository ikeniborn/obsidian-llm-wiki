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
      .setDesc('Выберите бэкенд для выполнения операций.')
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
        .setDesc("0.0–1.0. Низкая (0.1–0.3) — точные факты, высокая — творческий стиль.")
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
        .setDesc("Максимум токенов в ответе. Для вики-страниц рекомендуется ≥ 4096.")
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
        .setDesc("0.0–1.0, или пусто — отключить. Альтернатива temperature (nucleus sampling).")
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
        .setDesc("Таймаут HTTP-запроса к LLM. Для Ollama на больших моделях рекомендуется 300+.")
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
        .setDesc("Размер контекста модели. Только Ollama. Пусто — использовать дефолт модели.")
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
        .setDesc("Добавляется в начало системного промпта каждой операции. Перезаписывает дефолт при изменении.")
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
        .setName("Папка domain-map")
        .setDesc("Где хранить domain-map-<vault>.json. Пусто — авто: <vault>/.obsidian/plugins/llm-wiki/")
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
      .setDesc("Абсолютный путь к файлу лога. Каждый RunEvent пишется как одна JSON-строка. Пусто — логирование отключено.")
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
