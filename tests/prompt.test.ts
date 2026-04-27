import { describe, it, expect } from "vitest";
import { buildPrompt } from "../src/prompt";

describe("buildPrompt", () => {
  it("ingest with simple path", () => {
    expect(buildPrompt({ operation: "ingest", args: ["vaults/Work/note.md"] }))
      .toBe('/llm-wiki ingest "vaults/Work/note.md"');
  });

  it("ingest with cyrillic path with spaces", () => {
    expect(buildPrompt({ operation: "ingest", args: ["vaults/Work/!Daily/2026-04-26 Встреча.md"] }))
      .toBe('/llm-wiki ingest "vaults/Work/!Daily/2026-04-26 Встреча.md"');
  });

  it("query with quoted question", () => {
    expect(buildPrompt({ operation: "query", args: ['Что такое "SCD2"?'] }))
      .toBe('/llm-wiki query "Что такое \\"SCD2\\"?"');
  });

  it("query-save appends --save", () => {
    expect(buildPrompt({ operation: "query-save", args: ["Какова архитектура?"] }))
      .toBe('/llm-wiki query "Какова архитектура?" --save');
  });

  it("lint with no args", () => {
    expect(buildPrompt({ operation: "lint", args: [] }))
      .toBe("/llm-wiki lint");
  });

  it("lint with domain", () => {
    expect(buildPrompt({ operation: "lint", args: ["ростелеком"] }))
      .toBe("/llm-wiki lint ростелеком");
  });

  it("init with domain and dry-run", () => {
    expect(buildPrompt({ operation: "init", args: ["ии", "--dry-run"] }))
      .toBe("/llm-wiki init ии --dry-run");
  });

  it("rejects backslash-only path", () => {
    expect(() => buildPrompt({ operation: "ingest", args: ["a\\b"] }))
      .toThrow(/backslash/i);
  });

  it("rejects newline in any arg", () => {
    expect(() => buildPrompt({ operation: "query", args: ["a\nb"] }))
      .toThrow(/newline/i);
  });
});
