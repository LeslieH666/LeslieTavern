/**
 * Pure configuration for LeslieTavern's small local-model setup helper.
 * Keep this separate from DOM and SillyTavern imports so it can be tested.
 */

export const LESLIE_LOCAL_MODEL = Object.freeze({
    modelPath: 'models\\Peach-2.0-9B-8k-Roleplay\\Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf',
    modelName: 'Peach 2.0 9B Q4_K_M',
    context: 8192,
    responseTokens: 512,
    runtimes: Object.freeze({
        koboldcpp: Object.freeze({
            apiType: 'koboldcpp',
            endpoint: 'http://127.0.0.1:5001',
            label: 'KoboldCpp',
            startupHint: '在 KoboldCpp 中加载 models\\Peach-2.0-9B-8k-Roleplay\\Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf，选择 CUDA，端口设为 5001，然后回到 LeslieTavern 点击“应用并连接”。',
        }),
        llamacpp: Object.freeze({
            apiType: 'llamacpp',
            endpoint: 'http://127.0.0.1:8080',
            label: 'llama.cpp',
            startupHint: '在 llama-server 中加载 models\\Peach-2.0-9B-8k-Roleplay\\Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf，监听 127.0.0.1:8080，然后回到 LeslieTavern 点击“应用并连接”。',
        }),
    }),
    generation: Object.freeze({
        temp: 0.9,
        top_p: 0.9,
        top_k: 40,
        min_p: 0.05,
        rep_pen: 1.1,
        rep_pen_range: 4096,
        streaming: true,
        do_sample: true,
        add_bos_token: true,
        skip_special_tokens: true,
        include_reasoning: true,
    }),
});

export function getLeslieLocalRuntime(runtime) {
    return LESLIE_LOCAL_MODEL.runtimes[runtime] ?? LESLIE_LOCAL_MODEL.runtimes.koboldcpp;
}

export function getLeslieLocalRuntimeKeys() {
    return Object.keys(LESLIE_LOCAL_MODEL.runtimes);
}

export function getLeslieLocalSettings(runtime) {
    const selectedRuntime = getLeslieLocalRuntime(runtime);
    return {
        apiType: selectedRuntime.apiType,
        endpoint: selectedRuntime.endpoint,
        context: LESLIE_LOCAL_MODEL.context,
        responseTokens: LESLIE_LOCAL_MODEL.responseTokens,
        generation: { ...LESLIE_LOCAL_MODEL.generation },
    };
}
