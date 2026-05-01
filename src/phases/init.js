import { buildChatParams, extractStreamDeltas } from "./llm-utils";
export async function* runInit(args, vaultTools, llm, model, domains, repoRoot, vaultName, signal, opts = {}) {
    const domainId = args[0];
    const dryRun = args.includes("--dry-run");
    if (!domainId) {
        yield { kind: "error", message: "init: domain id required" };
        return;
    }
    const existing = domains.find((d) => d.id === domainId);
    if (existing) {
        yield { kind: "error", message: `Domain "${domainId}" already exists in domain-map.` };
        return;
    }
    yield { kind: "assistant_text", delta: `Bootstrapping domain "${domainId}"...\n` };
    const start = Date.now();
    const allFiles = await vaultTools.listFiles("");
    const sampleFiles = allFiles.slice(0, 5);
    const samples = await vaultTools.readAll(sampleFiles);
    const wikiRootGuess = `!Wiki`;
    const [schemaContent, indexContent] = await Promise.all([
        tryRead(vaultTools, `${wikiRootGuess}/_schema.md`),
        tryRead(vaultTools, `${wikiRootGuess}/_index.md`),
    ]);
    const systemContent = [
        `Ты — архитектор wiki-базы знаний. Сгенерируй запись домена для domain-map.json.`,
        `Верни ТОЛЬКО валидный JSON следующей структуры:`,
        `{`,
        `  "id": "${domainId}",`,
        `  "name": "Человекочитаемое название",`,
        `  "wiki_folder": "vaults/${vaultName}/!Wiki/${domainId}",`,
        `  "source_paths": [],`,
        `  "entity_types": [{"type":"...","description":"...","extraction_cues":["..."],"min_mentions_for_page":1,"wiki_subfolder":"${domainId}/..."}],`,
        `  "language_notes": ""`,
        `}`,
        schemaContent ? `\nКонвенции вики (_schema.md):\n${schemaContent.slice(0, 1500)}` : "",
        indexContent ? `\nСуществующая структура (_index.md):\n${indexContent.slice(0, 1000)}` : "",
    ].filter(Boolean).join("\n");
    const messages = [
        { role: "system", content: systemContent },
        {
            role: "user",
            content: [
                `Domain ID: ${domainId}`,
                `Vault name: ${vaultName}`,
                "",
                `Примеры файлов vault:`,
                [...samples.entries()].map(([p, c]) => `${p}:\n${c.slice(0, 400)}`).join("\n\n"),
            ].join("\n"),
        },
    ];
    const params = buildChatParams(model, messages, opts);
    let fullText = "";
    try {
        const stream = await llm.chat.completions.create({ ...params, stream: true }, { signal });
        for await (const chunk of stream) {
            const { reasoning, content } = extractStreamDeltas(chunk);
            if (reasoning)
                yield { kind: "assistant_text", delta: reasoning, isReasoning: true };
            if (content) {
                fullText += content;
                yield { kind: "assistant_text", delta: content };
            }
        }
    }
    catch (e) {
        if (signal.aborted || e.name === "AbortError")
            return;
        const resp = await llm.chat.completions.create({ ...params, stream: false });
        fullText = resp.choices[0]?.message?.content ?? "";
        if (fullText)
            yield { kind: "assistant_text", delta: fullText };
    }
    if (signal.aborted)
        return;
    let entry;
    try {
        const match = fullText.match(/\{[\s\S]*\}/);
        if (!match)
            throw new Error("No JSON object found in LLM response");
        entry = JSON.parse(match[0]);
        if (!entry.id || !entry.wiki_folder)
            throw new Error("Missing required fields");
    }
    catch (e) {
        yield { kind: "error", message: `Failed to parse domain entry: ${e.message}` };
        return;
    }
    if (dryRun) {
        yield {
            kind: "result",
            durationMs: Date.now() - start,
            text: `Dry run — domain entry:\n\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\``,
        };
        return;
    }
    yield { kind: "tool_use", name: "SaveDomain", input: { id: entry.id } };
    yield { kind: "domain_created", entry };
    yield { kind: "tool_result", ok: true };
    await appendLog(vaultTools, wikiRootGuess, domainId);
    yield {
        kind: "result",
        durationMs: Date.now() - start,
        text: `Domain "${domainId}" initialised. Edit entity_types in plugin settings to refine extraction.`,
    };
}
async function appendLog(vaultTools, wikiRoot, domainId) {
    const logPath = `${wikiRoot}/_log.md`;
    const today = new Date().toISOString().slice(0, 10);
    const entry = `\n## ${today} — init — ${domainId}\n- Домен создан\n`;
    try {
        const existing = await tryRead(vaultTools, logPath);
        await vaultTools.write(logPath, existing + entry);
    }
    catch { /* не критично */ }
}
async function tryRead(vaultTools, path) {
    try {
        return await vaultTools.read(path);
    }
    catch {
        return "";
    }
}
