/** Извлекает reasoning и content из одного streaming-чанка.
 *  Reasoning-модели (minimax, o1 и др.) возвращают думающий текст в нестандартном поле delta.reasoning.
 *  Модели без поддержки reasoning возвращают пустую строку — ошибок не возникает. */
export function extractStreamDeltas(chunk) {
    const delta = chunk.choices[0]?.delta;
    const rawReasoning = delta?.reasoning;
    return {
        reasoning: typeof rawReasoning === "string" ? rawReasoning : "",
        content: typeof delta?.content === "string" ? delta.content : "",
    };
}
export function buildChatParams(model, messages, opts) {
    const msgs = opts.systemPrompt ? injectSystemPrompt(messages, opts.systemPrompt) : messages;
    const params = { model, messages: msgs };
    if (opts.temperature !== undefined)
        params.temperature = opts.temperature;
    if (opts.maxTokens != null)
        params.max_tokens = opts.maxTokens;
    if (opts.topP != null)
        params.top_p = opts.topP;
    if (opts.numCtx != null)
        params.num_ctx = opts.numCtx;
    return params;
}
function injectSystemPrompt(messages, systemPrompt) {
    const firstSystem = messages.findIndex((m) => m.role === "system");
    if (firstSystem >= 0) {
        const updated = [...messages];
        const existing = typeof updated[firstSystem].content === "string" ? updated[firstSystem].content : "";
        updated[firstSystem] = { role: "system", content: `${systemPrompt}\n\n${existing}` };
        return updated;
    }
    return [{ role: "system", content: systemPrompt }, ...messages];
}
