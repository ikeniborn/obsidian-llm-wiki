import type { WikiOperation } from "./types";

interface BuildPromptInput {
  operation: WikiOperation;
  args: string[];
}

const QUOTED_OPS: ReadonlyArray<WikiOperation> = ["ingest", "query", "query-save"];

export function buildPrompt({ operation, args }: BuildPromptInput): string {
  for (const a of args) {
    if (a.includes("\n") || a.includes("\r")) {
      throw new Error("Argument contains newline character — refusing to build prompt");
    }
    if (a.includes("\\")) {
      throw new Error("Argument contains backslash — refusing to build prompt");
    }
  }

  if (operation === "query-save") {
    const [question, ...rest] = args;
    if (!question) throw new Error("query-save requires a question argument");
    return `/llm-wiki query "${escapeQuotes(question)}"${rest.map(formatTail).join("")} --save`;
  }

  if (QUOTED_OPS.includes(operation)) {
    const [primary, ...rest] = args;
    if (!primary) throw new Error(`${operation} requires a primary argument`);
    const op = operation === "query-save" ? "query" : operation;
    return `/llm-wiki ${op} "${escapeQuotes(primary)}"${rest.map(formatTail).join("")}`;
  }

  // lint, init
  const tail = args.length > 0 ? " " + args.join(" ") : "";
  return `/llm-wiki ${operation}${tail}`;
}

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '\\"');
}

function formatTail(arg: string): string {
  return arg.startsWith("--") ? ` ${arg}` : ` "${escapeQuotes(arg)}"`;
}
