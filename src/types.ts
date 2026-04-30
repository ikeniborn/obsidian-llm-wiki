import type OpenAI from "openai";
import type { DomainEntry } from "./domain-map";

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
  | { kind: "ask_user"; question: string; options: string[]; toolUseId: string }
  | { kind: "domain_created"; entry: DomainEntry };

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

export type OpKey = "ingest" | "query" | "lint" | "init";
export type OpMap<T> = Record<OpKey, T>;

export interface ClaudeOperationConfig {
  model: string;
  maxTokens: number;
}

export interface NativeOperationConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface LlmWikiPluginSettings {
  backend: "claude-agent" | "native-agent";
  systemPrompt: string;
  domains: DomainEntry[];
  maxTokens: number;
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
    perOperation: boolean;
    operations: OpMap<ClaudeOperationConfig>;
  };
  nativeAgent: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    topP: number | null;
    numCtx: number | null;
    perOperation: boolean;
    operations: OpMap<NativeOperationConfig>;
  };
}

export const DEFAULT_SETTINGS: LlmWikiPluginSettings = {
  backend: "claude-agent",
  systemPrompt: "You are a wiki assistant for a technical knowledge base. Be precise, factual, and concise. Use only the provided sources.",
  domains: [],
  maxTokens: 4096,
  agentLogPath: "",
  historyLimit: 20,
  timeouts: { ingest: 300, query: 300, lint: 600, init: 3600 },
  history: [],
  claudeAgent: {
    iclaudePath: "",
    model: "sonnet",
    perOperation: false,
    operations: {
      ingest: { model: "haiku",  maxTokens: 4096 },
      query:  { model: "sonnet", maxTokens: 4096 },
      lint:   { model: "haiku",  maxTokens: 4096 },
      init:   { model: "sonnet", maxTokens: 8192 },
    },
  },
  nativeAgent: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    model: "llama3.2",
    temperature: 0.2,
    topP: null,
    numCtx: null,
    perOperation: false,
    operations: {
      ingest: { model: "llama3.2", maxTokens: 4096, temperature: 0.2 },
      query:  { model: "llama3.2", maxTokens: 4096, temperature: 0.2 },
      lint:   { model: "llama3.2", maxTokens: 4096, temperature: 0.2 },
      init:   { model: "llama3.2", maxTokens: 8192, temperature: 0.2 },
    },
  },
};
