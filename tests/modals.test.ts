import { describe, it, expect } from "vitest";
import { defaultSourcePaths } from "../src/modals";

describe("defaultSourcePaths", () => {
  it("returns wiki_folder wrapped in array", () => {
    expect(defaultSourcePaths("vaults/Work/!Wiki/ии")).toEqual(["vaults/Work/!Wiki/ии"]);
  });

  it("returns empty array for empty string", () => {
    expect(defaultSourcePaths("")).toEqual([]);
  });
});
