import type { RunEvent } from "./types";

const PREVIEW_MAX = 200;

function isRecord(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === "object" && obj !== null;
}

export function parseStreamLine(raw: string): RunEvent | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // iclaude.sh wrapper и сторонние логгеры могут писать в stdout не-JSON строки
  // (баннеры, ANSI-цвета). Считаем строкой stream-json только те, что начинаются
  // с '{' — остальное молча игнорируем, чтобы не засорять панель.
  if (!trimmed.startsWith("{")) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return { kind: "error", message: `stream parse error: ${truncate(trimmed, 120)}` };
  }

  if (!isRecord(obj)) return null;

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

function mapAssistant(obj: Record<string, unknown>): RunEvent | null {
  const msg = obj.message;
  if (!isRecord(msg)) return null;
  const content = msg.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  // одна строка stream-json несёт один блок (один tool_use или один text-чанк)
  const block = content[0] as Record<string, unknown>;
  if (block?.type === "tool_use") {
    if (block.name === "AskUserQuestion") {
      const input = isRecord(block.input) ? block.input : {};
      return {
        kind: "ask_user",
        question: String(input.prompt ?? ""),
        options: Array.isArray(input.options)
          ? (input.options as unknown[]).map(String)
          : [],
        toolUseId: String(block.id ?? ""),
      };
    }
    return { kind: "tool_use", name: String(block.name ?? "?"), input: block.input };
  }
  if (block?.type === "text") {
    return { kind: "assistant_text", delta: String(block.text ?? "") };
  }
  return null;
}

function mapUserToolResult(obj: Record<string, unknown>): RunEvent | null {
  const msg = obj.message;
  if (!isRecord(msg)) return null;
  const content = msg.content;
  if (!Array.isArray(content)) return null;
  const block = content[0];
  if (!isRecord(block) || block.type !== "tool_result") return null;
  const isErr = Boolean(block.is_error);
  const preview = typeof block.content === "string" ? truncate(block.content, PREVIEW_MAX) : undefined;
  return { kind: "tool_result", ok: !isErr, preview };
}

function mapResult(obj: Record<string, unknown>): RunEvent {
  if (obj.is_error || obj.subtype === "error") {
    return { kind: "error", message: String(obj.result ?? obj.error ?? "claude error") };
  }
  return {
    kind: "result",
    durationMs: Number(obj.duration_ms ?? 0),
    usdCost: typeof obj.total_cost_usd === "number" ? obj.total_cost_usd : undefined,
    text: String(obj.result ?? ""),
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
