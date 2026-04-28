export type WikiOperation =
  | "ingest"
  | "query"
  | "query-save"
  | "lint"
  | "init";

export type WikiDomain = string;

export interface RunRequest {
  operation: WikiOperation;
  args: string[];
  cwd: string | undefined;
  signal: AbortSignal;
  timeoutMs: number;
}

export type RunEvent =
  | { kind: "system"; message: string }
  | { kind: "tool_use"; name: string; input: unknown }
  | { kind: "tool_result"; ok: boolean; preview?: string }
  | { kind: "assistant_text"; delta: string }
  | { kind: "result"; durationMs: number; usdCost?: number; text: string }
  | { kind: "error"; message: string }
  | { kind: "exit"; code: number }
  | { kind: "ask_user"; question: string; options: string[]; toolUseId: string };

export interface RunHistoryEntry {
  id: string;
  operation: WikiOperation;
  args: string[];
  startedAt: number;
  finishedAt: number;
  status: "done" | "error" | "cancelled";
  finalText: string;
  steps: Array<{ kind: "tool_use" | "tool_result"; label: string }>;
}

export interface LlmWikiPluginSettings {
  iclaudePath: string;
  cwd: string;
  allowedTools: string[];
  /** Модель claude. Пусто = модель по умолчанию из настроек claude. */
  model: string;
  showRawJson: boolean;
  historyLimit: number;
  timeouts: {
    ingest: number;
    query: number;
    lint: number;
    init: number;
  };
  history: RunHistoryEntry[];
  backend: "claude-code" | "native-agent";
  nativeAgent: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}

/** Пресеты модели для UI; пользователь может ввести произвольное значение. */
export const MODEL_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "(по умолчанию)" },
  { value: "opus", label: "opus (Opus 4.7)" },
  { value: "sonnet", label: "sonnet (Sonnet 4.6)" },
  { value: "haiku", label: "haiku (Haiku 4.5)" },
];

export const DEFAULT_SETTINGS: LlmWikiPluginSettings = {
  iclaudePath: "",
  cwd: "",
  allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"],
  model: "",
  showRawJson: false,
  historyLimit: 20,
  timeouts: { ingest: 300, query: 300, lint: 600, init: 3600 },
  history: [],
  backend: "claude-code",
  nativeAgent: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    model: "llama3.2",
  },
};
