import { describe, it, expect } from "vitest";
import { validateDomainId } from "../src/domain-map";

describe("validateDomainId", () => {
  it("returns null for valid ASCII id", () => {
    expect(validateDomainId("projects")).toBeNull();
  });

  it("returns null for valid cyrillic id", () => {
    expect(validateDomainId("ии")).toBeNull();
  });

  it("returns null for id with hyphen and underscore", () => {
    expect(validateDomainId("my-domain_v2")).toBeNull();
  });

  it("returns error string for empty id", () => {
    expect(validateDomainId("")).not.toBeNull();
  });

  it("returns error string for id with slash", () => {
    expect(validateDomainId("bad/slash")).not.toBeNull();
  });

  it("returns error string for id with space", () => {
    expect(validateDomainId("bad id")).not.toBeNull();
  });

  it("returns error string for id with dot", () => {
    expect(validateDomainId("bad.id")).not.toBeNull();
  });
});
