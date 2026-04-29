import type OpenAI from "openai";

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
  domainId?: string;
}

export type RunEvent =
  | { kind: "system"; message: string }
  | { kind: "tool_use"; name: string; input: unknown }
  | { kind: "tool_result"; ok: boolean; preview?: string }
  | { kind: "assistant_text"; delta: string; isReasoning?: boolean }
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

export interface LlmCallOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number | null;
  systemPrompt?: string;
  numCtx?: number | null;
}

/** Минимальный интерфейс OpenAI-клиента, используемый фазами. */
export type LlmClient = {
  chat: {
    completions: {
      create(
        params: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
        opts?: { signal?: AbortSignal },
      ): Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>>;
      create(
        params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
        opts?: { signal?: AbortSignal },
      ): Promise<OpenAI.Chat.ChatCompletion>;
    };
  };
};

export interface LlmWikiPluginSettings {
  backend: "claude-agent" | "native-agent";
  agentLogPath: string;
  historyLimit: number;
  timeouts: {
    ingest: number;
    query: number;
    lint: number;
    init: number;
  };
  history: RunHistoryEntry[];
  claudeAgent: {
    iclaudePath: string;
    model: string;
    domainMapDir: string;
    systemPrompt: string;
    maxTokens: number;
    requestTimeoutSec: number;
  };
  nativeAgent: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    requestTimeoutSec: number;
    topP: number | null;
    systemPrompt: string;
    numCtx: number | null;
    domainMapDir: string;
  };
}

export const DEFAULT_SETTINGS: LlmWikiPluginSettings = {
  backend: "claude-agent",
  agentLogPath: "",
  historyLimit: 20,
  timeouts: { ingest: 300, query: 300, lint: 600, init: 3600 },
  history: [],
  claudeAgent: {
    iclaudePath: "",
    model: "sonnet",
    domainMapDir: "",
    systemPrompt: "",
    maxTokens: 4096,
    requestTimeoutSec: 300,
  },
  nativeAgent: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    model: "llama3.2",
    temperature: 0.2,
    maxTokens: 4096,
    requestTimeoutSec: 300,
    topP: null,
    systemPrompt: "You are a wiki assistant for a technical knowledge base. Be precise, factual, and concise. Use only the provided sources.",
    numCtx: null,
    domainMapDir: "",
  },
};
