import { describe, it, expect, vi } from "vitest";
import { runInit } from "../../src/phases/init";
import { VaultTools } from "../../src/vault-tools";
function mockAdapter(overrides = {}) {
    return {
        read: vi.fn().mockResolvedValue(""),
        write: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
        exists: vi.fn().mockResolvedValue(true),
        mkdir: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}
function makeLlm(json) {
    return {
        chat: {
            completions: {
                create: vi.fn().mockResolvedValue({
                    [Symbol.asyncIterator]: async function* () {
                        yield { choices: [{ delta: { content: json } }] };
                    },
                }),
            },
        },
    };
}
async function collect(gen) {
    const out = [];
    for await (const e of gen)
        out.push(e);
    return out;
}
const existingDomain = {
    id: "existing",
    name: "Existing",
    wiki_folder: "vaults/Test/!Wiki/existing",
    source_paths: [],
};
const validDomainJson = JSON.stringify({
    id: "newdomain",
    name: "New Domain",
    wiki_folder: "vaults/TestVault/!Wiki/newdomain",
    source_paths: [],
    entity_types: [],
    language_notes: "",
});
describe("runInit", () => {
    it("yields error when domainId is empty", async () => {
        const vt = new VaultTools(mockAdapter(), "/vault");
        const events = await collect(runInit([], vt, makeLlm("{}"), "model", [], "/vault", "TestVault", new AbortController().signal));
        expect(events.some((e) => e.kind === "error")).toBe(true);
    });
    it("yields error when domain already exists", async () => {
        const vt = new VaultTools(mockAdapter(), "/vault");
        const events = await collect(runInit(["existing"], vt, makeLlm("{}"), "model", [existingDomain], "/vault", "TestVault", new AbortController().signal));
        expect(events.some((e) => e.kind === "error")).toBe(true);
    });
    it("dry-run returns JSON preview without domain_created event", async () => {
        const adapter = mockAdapter({
            list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
        });
        const vt = new VaultTools(adapter, "/vault");
        const events = await collect(runInit(["newdomain", "--dry-run"], vt, makeLlm(validDomainJson), "model", [], "/vault", "TestVault", new AbortController().signal));
        const result = events.find((e) => e.kind === "result");
        expect(result).toBeDefined();
        expect(result.text).toContain("Dry run");
        expect(events.some((e) => e.kind === "domain_created")).toBe(false);
    });
    it("yields domain_created event with parsed entry on success", async () => {
        const adapter = mockAdapter({
            list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
        });
        const vt = new VaultTools(adapter, "/vault");
        const events = await collect(runInit(["newdomain"], vt, makeLlm(validDomainJson), "model", [], "/vault", "TestVault", new AbortController().signal));
        const domainCreated = events.find((e) => e.kind === "domain_created");
        expect(domainCreated).toBeDefined();
        expect(domainCreated.entry.id).toBe("newdomain");
        expect(domainCreated.entry.wiki_folder).toBe("vaults/TestVault/!Wiki/newdomain");
    });
    it("yields result event after domain_created", async () => {
        const adapter = mockAdapter({
            list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
        });
        const vt = new VaultTools(adapter, "/vault");
        const events = await collect(runInit(["newdomain"], vt, makeLlm(validDomainJson), "model", [], "/vault", "TestVault", new AbortController().signal));
        const result = events.find((e) => e.kind === "result");
        expect(result).toBeDefined();
        expect(result.text).toContain("newdomain");
    });
});
