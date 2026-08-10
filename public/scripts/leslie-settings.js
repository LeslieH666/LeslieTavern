/**
 * Leslie's simple settings hub.
 *
 * This module only reorganizes access to existing SillyTavern controls. The
 * original drawers, event handlers, saved settings, and data formats remain
 * the source of truth.
 */

import { eventSource, event_types } from '../script.js';
import { getLeslieConnectionState } from './leslie-connection-state.js';
import './leslie-voice-settings.js';

const SECONDARY_DRAWERS = [
    'ai-config-button',
    'sys-settings-button',
    'advanced-formatting-button',
    'WI-SP-button',
    'user-settings-button',
    'backgrounds-button',
    'extensions-settings-button',
    'persona-management-button',
];

const COPY = {
    zh: {
        launcher: '设置',
        close: '关闭设置',
        backToChat: '返回聊天',
        settings: '设置',
        subtitle: 'Leslie 简洁模式',
        introEyebrow: '日常设置',
        introTitle: '把常用的留在眼前',
        introBody: '这里只整理入口，不会删除或改写 SillyTavern 的原功能。常用选项可以直接调整，复杂功能仍保留在高级设置中。',
        safeNote: '聊天记录、角色卡和提示词顺序不会因这个界面而改变。',
        quickTitle: '外观与使用习惯',
        quickBody: '这些选项会沿用原来的保存方式。',
        theme: '界面主题',
        themeHelp: '选择整体颜色方案',
        language: '界面语言',
        languageHelp: '更改后页面会重新载入',
        reducedMotion: '减少动态效果',
        reducedMotionHelp: '减少动画，阅读更稳定',
        performance: '性能优先',
        performanceHelp: '关闭背景模糊，低配置设备更流畅',
        essentialsTitle: '核心功能',
        essentialsBody: '按要完成的事情寻找设置，不必理解内部术语。',
        modelTitle: '模型连接',
        modelBody: '选择模型服务、填写地址和密钥，并检查是否连接成功。',
        replyTitle: '回复方式',
        replyBody: '调整回复长度、随机程度和生成预设。改动会影响之后的回复风格。',
        voiceTitle: '角色语音',
        voiceBody: '接入火山引擎，为不同角色设置音色并在回复后自动朗读。',
        voiceDetailTitle: '火山引擎角色语音',
        voiceDetailBody: '密钥、音色和自动朗读集中在这里配置，不改变角色回复文字或提示词。',
        characterTitle: '角色与会话',
        characterBody: '选择或创建角色，查看已有角色和聊天入口。',
        personaTitle: '我的身份',
        personaBody: '设置你在对话中是谁，以及角色如何称呼你。',
        worldTitle: '世界与记忆',
        worldBody: '管理故事背景、地点、规则和会被自动引用的资料。',
        connected: '已连接',
        configured: '已配置',
        checking: '正在检测',
        disconnected: '未连接',
        open: '打开',
        advancedTitle: '高级设置',
        advancedBody: '复杂选项集中放在这里，日常使用通常不需要修改。',
        promptTitle: '提示词与格式',
        promptBody: '控制消息怎样组合后交给模型。设置不当会明显改变回复效果。',
        extensionsTitle: '扩展能力',
        extensionsBody: '管理翻译、语音、图片生成等附加功能。',
        backgroundTitle: '背景素材',
        backgroundBody: '上传、整理和选择聊天背景。',
        fullSettingsTitle: '完整界面设置',
        fullSettingsBody: '进入 SillyTavern 原有的全部界面与行为选项。',
        lockedTitle: '高级选项已收起',
        lockedBody: '这些功能仍然完整保留。只有需要精细调整时再展开，可减少误操作。',
        unlock: '展开高级设置',
        relock: '收起高级设置',
        footer: '所有修改仍由 SillyTavern 原来的设置系统保存，可随时在对应面板中恢复。',
        back: '返回设置首页',
        simpleDetail: '常用设置',
        navigation: '设置分类',
        overviewTitle: '通用与外观',
        overviewBody: '主题、语言和日常使用习惯',
        coreGroup: '对话',
        roleGroup: '角色资料',
        advancedGroup: '高级与兼容',
        contentEyebrow: '设置内容',
        originalSave: '由 SillyTavern 原设置系统保存',
        fullSettings: '打开完整设置',
        fullSettingsHelp: '需要其他供应商或精细参数时再进入。',
        modelDetailTitle: '模型连接',
        modelDetailBody: '选择最常用的连接方式，在这里完成地址、密钥和模型设置。',
        serviceTitle: '选择连接方式',
        serviceBody: '选择后会同步切换 SillyTavern 原来的接口类型。',
        apiKindTitle: '先选择 API 类型',
        apiKindBody: '联网 API 使用厂商提供的密钥；本地 API 连接你电脑上运行的模型服务。',
        onlineApi: '联网 API',
        onlineApiBody: 'DeepSeek、OpenAI 等云端模型服务',
        localApi: '本地 API',
        localApiBody: 'Ollama、llama.cpp 等本机模型',
        chooseProvider: '请选择下方的一种连接方式，再填写对应信息。',
        serviceDeepSeek: 'DeepSeek',
        serviceDeepSeekBody: 'DeepSeek 官方联网接口。',
        serviceCustom: 'OpenAI 兼容',
        serviceCustomBody: '适合第三方联网 API 或中转服务。',
        serviceOpenRouter: 'OpenRouter',
        serviceOpenRouterBody: '使用一个密钥访问多个模型供应商。',
        serviceClaude: 'Anthropic Claude',
        serviceClaudeBody: '连接 Anthropic 官方 Claude 接口。',
        serviceGemini: 'Google Gemini',
        serviceGeminiBody: '连接 Google AI Studio 的 Gemini 接口。',
        serviceOllama: 'Ollama',
        serviceOllamaBody: '连接本机运行的 Ollama 模型。',
        serviceLlamaCpp: 'llama.cpp',
        serviceLlamaCppBody: '连接 llama.cpp 本地服务器。',
        serviceKoboldCpp: 'KoboldCpp',
        serviceKoboldCppBody: '连接 KoboldCpp 本地服务器。',
        serviceTextGen: 'Text Generation WebUI',
        serviceTextGenBody: '连接 oobabooga WebUI 接口。',
        serviceLocalGeneric: '通用本地接口',
        serviceLocalGenericBody: '连接兼容接口的其他本地推理程序。',
        serviceOpenAI: 'OpenAI',
        serviceOpenAIBody: '直接连接 OpenAI 官方接口。',
        endpoint: '服务地址',
        endpointHelp: '填写接口的基础地址；OpenAI 兼容地址通常以 /v1 结尾。',
        apiKey: 'API 密钥',
        apiKeyHelp: '已保存密钥时可以留空；新输入的密钥仍由原系统保存。',
        model: '模型',
        modelHelp: '连接成功后可从列表选择，也可以按服务要求填写模型名称。',
        availableModel: '可用模型列表',
        connect: '连接并读取模型',
        autoConnect: '启动时自动连接',
        autoConnectHelp: '下次打开应用时尝试连接上次使用的服务。',
        thinkingMode: '思考模式（默认关闭）',
        thinkingModeHelp: '关闭后会明确要求兼容模型直接回答，不请求也不显示思考过程；日常角色对话建议关闭。',
        privacy: '密钥只会传给你选择的模型服务，不会由 Leslie 另行保存。',
        allProviders: '其他供应商与详细连接设置',
        otherProviderActive: '当前使用的是其他连接方式。你可以选择上方常用服务，或打开完整连接设置继续配置。',
        settingUnavailable: '当前接口没有提供这项常用设置，可在完整设置中调整。',
        replyDetailTitle: '回复方式',
        replyDetailBody: '只保留最常调整的生成选项，并解释它们会怎样影响回复。',
        stylePresetsTitle: '选择一种写作节奏',
        stylePresetsBody: '先用场景预设找到合适的起点，再用下方滑块继续微调。',
        stylePresetsSafe: '预设只调整回复长度和自由发挥程度，不会改动提示词或角色设定；DeepSeek 开启思考时会自动预留思考与正文额度。',
        styleBalanced: '均衡叙事',
        styleBalancedBody: '叙述与对话保持适中，适合大多数日常角色扮演。',
        styleBalancedTag: '适中 · 自然',
        styleNovel: '长篇小说',
        styleNovelBody: '篇幅更长、描写更丰富，适合连续场景和章节式创作。',
        styleNovelTag: '长篇 · 丰富',
        styleDialogue: '对话推进',
        styleDialogueBody: '回复更紧凑、节奏更快，适合角色之间来回交流。',
        styleDialogueTag: '紧凑 · 灵活',
        styleConcise: '简洁回复',
        styleConciseBody: '快速给出重点，适合短回合、指令或轻量聊天。',
        styleConciseTag: '短小 · 稳定',
        styleCustom: '手动微调',
        styleApplied: '已应用',
        styleAppliedTail: '，你仍可继续调整下方选项。',
        styleRestored: '已恢复应用预设前的设置。',
        undoPreset: '撤回刚才的预设',
        preset: '回复预设',
        presetHelp: '一次套用一组已经保存好的生成参数。',
        responseLength: '单次回复长度',
        responseLengthHelp: '数值越大，模型一次可以写得越长；DeepSeek 开启思考时会在请求中额外保护思考与正文的共享额度。',
        contextSize: '对话记忆范围',
        contextSizeHelp: '模型一次能读取的历史内容上限；不要超过模型支持的范围。',
        creativity: '自由发挥程度',
        creativityHelp: '较低更稳定，较高更多变化；它对应原来的 Temperature。',
        streaming: '逐字显示回复',
        streamingHelp: '开启后，模型生成的文字会边生成边显示。',
        advancedReply: '高级采样与完整回复设置',
        characterDetailTitle: '角色与会话',
        characterDetailBody: '先确认当前角色，再进入选择、编辑或相关设定。',
        currentCharacter: '当前角色',
        noCharacter: '尚未选择角色',
        characterGuide: '角色卡仍使用 SillyTavern 原格式保存，这里只整理常用操作入口。',
        chooseCharacter: '选择或新建角色',
        editCharacter: '编辑当前角色',
        goPersona: '设置我的身份',
        goWorld: '设置世界与记忆',
        personaDetailTitle: '我的身份',
        personaDetailBody: '说明你在故事中是谁，以及这段说明怎样加入对话。',
        currentPersona: '当前身份',
        noPersona: '尚未选择身份',
        personaDescription: '身份描述',
        personaDescriptionHelp: '例如年龄、外貌、性格或角色应该知道的玩家背景。',
        personaPosition: '加入对话的位置',
        personaPositionHelp: '保持当前设置通常即可；特殊角色扮演再调整。',
        autoLockPersona: '自动绑定到当前聊天',
        autoLockPersonaHelp: '切换身份后，让该聊天下次继续使用同一个身份。',
        managePersonas: '选择或新建身份',
        renamePersona: '重命名当前身份',
        worldDetailTitle: '世界与记忆',
        worldDetailBody: '选择当前聊天可以引用的背景资料，复杂触发规则仍放在完整编辑器中。',
        activeWorlds: '启用的世界资料',
        activeWorldsHelp: '可多选。被选中的资料库会按关键词和规则参与对话。',
        recursiveWorld: '允许资料互相触发',
        recursiveWorldHelp: '一条资料提到另一条关键词时，可以继续引用相关内容。',
        manageWorlds: '打开完整世界资料编辑器',
    },
    en: {
        launcher: 'Settings',
        close: 'Close settings',
        backToChat: 'Back to chats',
        settings: 'Settings',
        subtitle: 'Leslie simple mode',
        introEyebrow: 'Everyday settings',
        introTitle: 'Keep the essentials in sight',
        introBody: 'This page reorganizes access without removing or rewriting SillyTavern features. Common options stay close at hand, while complex tools remain available under Advanced.',
        safeNote: 'This interface does not change chats, character cards, or prompt order.',
        quickTitle: 'Appearance & comfort',
        quickBody: 'These controls use SillyTavern’s existing save behavior.',
        theme: 'Theme',
        themeHelp: 'Choose the overall color scheme',
        language: 'Language',
        languageHelp: 'The page reloads after a change',
        reducedMotion: 'Reduce motion',
        reducedMotionHelp: 'Use fewer animations for steadier reading',
        performance: 'Prioritize performance',
        performanceHelp: 'Disable background blur on slower devices',
        essentialsTitle: 'Essentials',
        essentialsBody: 'Find settings by what you want to do, not by internal terminology.',
        modelTitle: 'Model connection',
        modelBody: 'Choose a model service, enter its address and key, and check the connection.',
        replyTitle: 'Reply style',
        replyBody: 'Adjust response length, randomness, and generation presets. Changes affect future replies.',
        voiceTitle: 'Character voice',
        voiceBody: 'Connect Volcengine, assign voices, and speak automatically after replies.',
        voiceDetailTitle: 'Volcengine character voice',
        voiceDetailBody: 'Configure credentials, voices, and automatic narration without changing reply text or prompts.',
        characterTitle: 'Characters & chats',
        characterBody: 'Choose or create characters and access existing conversations.',
        personaTitle: 'My identity',
        personaBody: 'Define who you are in the conversation and how characters address you.',
        worldTitle: 'World & memory',
        worldBody: 'Manage story background, locations, rules, and automatically referenced notes.',
        connected: 'Connected',
        configured: 'Configured',
        checking: 'Checking',
        disconnected: 'Not connected',
        open: 'Open',
        advancedTitle: 'Advanced settings',
        advancedBody: 'Complex options are kept together here. Most conversations do not need them.',
        promptTitle: 'Prompts & formatting',
        promptBody: 'Control how messages are assembled for the model. Incorrect settings can noticeably change replies.',
        extensionsTitle: 'Extensions',
        extensionsBody: 'Manage optional translation, speech, image generation, and other tools.',
        backgroundTitle: 'Backgrounds',
        backgroundBody: 'Upload, organize, and choose chat backgrounds.',
        fullSettingsTitle: 'All interface settings',
        fullSettingsBody: 'Open every original SillyTavern interface and behavior option.',
        lockedTitle: 'Advanced options are tucked away',
        lockedBody: 'Every feature is still available. Reveal these controls only when you need precise customization.',
        unlock: 'Show advanced settings',
        relock: 'Hide advanced settings',
        footer: 'SillyTavern’s original settings system still saves every change, and each option can be restored in its original panel.',
        back: 'Back to settings',
        simpleDetail: 'Common settings',
        navigation: 'Settings categories',
        overviewTitle: 'General & appearance',
        overviewBody: 'Theme, language, and everyday preferences',
        coreGroup: 'Conversation',
        roleGroup: 'Character data',
        advancedGroup: 'Advanced & compatibility',
        contentEyebrow: 'Settings detail',
        originalSave: 'Saved by SillyTavern settings',
        fullSettings: 'Open all settings',
        fullSettingsHelp: 'Use this only for other providers or precise parameters.',
        modelDetailTitle: 'Model connection',
        modelDetailBody: 'Choose a common connection and configure its address, key, and model here.',
        serviceTitle: 'Choose a connection',
        serviceBody: 'Your choice also updates SillyTavern’s original API type.',
        apiKindTitle: 'Choose an API type first',
        apiKindBody: 'Online APIs use a provider key. Local APIs connect to a model server running on your computer.',
        onlineApi: 'Online API',
        onlineApiBody: 'Cloud services such as DeepSeek and OpenAI',
        localApi: 'Local API',
        localApiBody: 'Local models such as Ollama and llama.cpp',
        chooseProvider: 'Choose one connection below, then enter its corresponding details.',
        serviceDeepSeek: 'DeepSeek',
        serviceDeepSeekBody: 'The official DeepSeek online API.',
        serviceCustom: 'OpenAI-compatible',
        serviceCustomBody: 'For third-party online APIs and relay services.',
        serviceOpenRouter: 'OpenRouter',
        serviceOpenRouterBody: 'Use one key to access models from multiple providers.',
        serviceClaude: 'Anthropic Claude',
        serviceClaudeBody: 'Connect to Anthropic’s official Claude API.',
        serviceGemini: 'Google Gemini',
        serviceGeminiBody: 'Connect to Gemini through Google AI Studio.',
        serviceOllama: 'Ollama',
        serviceOllamaBody: 'Connect to Ollama models running on this computer.',
        serviceLlamaCpp: 'llama.cpp',
        serviceLlamaCppBody: 'Connect to a local llama.cpp server.',
        serviceKoboldCpp: 'KoboldCpp',
        serviceKoboldCppBody: 'Connect to a local KoboldCpp server.',
        serviceTextGen: 'Text Generation WebUI',
        serviceTextGenBody: 'Connect to an oobabooga WebUI API.',
        serviceLocalGeneric: 'Generic local API',
        serviceLocalGenericBody: 'Connect to another compatible local inference server.',
        serviceOpenAI: 'OpenAI',
        serviceOpenAIBody: 'Connect directly to the official OpenAI API.',
        endpoint: 'Server address',
        endpointHelp: 'Enter the base URL. OpenAI-compatible addresses usually end in /v1.',
        apiKey: 'API key',
        apiKeyHelp: 'Leave this blank when a key is already saved. New keys still use the original secure flow.',
        model: 'Model',
        modelHelp: 'Choose after connecting, or enter the model name required by your service.',
        availableModel: 'Available models',
        connect: 'Connect and load models',
        autoConnect: 'Connect automatically on startup',
        autoConnectHelp: 'Try the last-used service when the app opens again.',
        thinkingMode: 'Thinking mode (off by default)',
        thinkingModeHelp: 'Keep this off for direct replies. Compatible models will be told not to reason, and hidden thoughts will not be requested or shown.',
        privacy: 'Keys are sent only to the model service you choose. Leslie does not create another copy.',
        allProviders: 'Other providers and detailed connection settings',
        otherProviderActive: 'Another connection type is active. Choose a common service above, or continue in the full connection settings.',
        settingUnavailable: 'This common control is not available for the current API. You can adjust it in all settings.',
        replyDetailTitle: 'Reply style',
        replyDetailBody: 'Keep the generation options people change most often, with plain-language explanations.',
        stylePresetsTitle: 'Choose a writing rhythm',
        stylePresetsBody: 'Start with a scene preset, then fine-tune it with the controls below.',
        stylePresetsSafe: 'Presets only adjust response length and creative freedom. DeepSeek thinking automatically reserves room for reasoning and final text.',
        styleBalanced: 'Balanced story',
        styleBalancedBody: 'A natural mix of narration and dialogue for most roleplay chats.',
        styleBalancedTag: 'Medium · Natural',
        styleNovel: 'Long-form novel',
        styleNovelBody: 'Longer, richer writing for continuous scenes and chapter-style creation.',
        styleNovelTag: 'Long · Rich',
        styleDialogue: 'Dialogue-driven',
        styleDialogueBody: 'Tighter, faster replies for back-and-forth character conversation.',
        styleDialogueTag: 'Tight · Lively',
        styleConcise: 'Concise replies',
        styleConciseBody: 'Quickly reaches the point for short turns, instructions, and lightweight chat.',
        styleConciseTag: 'Short · Steady',
        styleCustom: 'Fine-tuned',
        styleApplied: 'Applied ',
        styleAppliedTail: '. You can still adjust the controls below.',
        styleRestored: 'Restored the settings from before the preset was applied.',
        undoPreset: 'Undo the last preset',
        preset: 'Reply preset',
        presetHelp: 'Apply a previously saved group of generation parameters.',
        responseLength: 'Response length',
        responseLengthHelp: 'Higher values allow longer replies. DeepSeek thinking protects additional shared room for reasoning and final text.',
        contextSize: 'Conversation memory',
        contextSizeHelp: 'The maximum history the model can read at once. Do not exceed the model’s limit.',
        creativity: 'Creative freedom',
        creativityHelp: 'Lower is steadier; higher allows more variation. This is the original Temperature setting.',
        streaming: 'Show text as it is generated',
        streamingHelp: 'Display the reply gradually while the model is writing it.',
        advancedReply: 'Advanced sampling and all reply settings',
        characterDetailTitle: 'Characters & chats',
        characterDetailBody: 'Check the current character, then choose, edit, or open related settings.',
        currentCharacter: 'Current character',
        noCharacter: 'No character selected',
        characterGuide: 'Character cards still use SillyTavern’s original format. This page only organizes common actions.',
        chooseCharacter: 'Choose or create a character',
        editCharacter: 'Edit current character',
        goPersona: 'Set my identity',
        goWorld: 'Set world & memory',
        personaDetailTitle: 'My identity',
        personaDetailBody: 'Describe who you are in the story and how that description enters the conversation.',
        currentPersona: 'Current identity',
        noPersona: 'No identity selected',
        personaDescription: 'Identity description',
        personaDescriptionHelp: 'For example: age, appearance, personality, or player background the character should know.',
        personaPosition: 'Position in the conversation',
        personaPositionHelp: 'The current setting is usually best; change it only for special roleplay setups.',
        autoLockPersona: 'Keep this identity with the chat',
        autoLockPersonaHelp: 'After switching identity, use it again the next time this chat opens.',
        managePersonas: 'Choose or create an identity',
        renamePersona: 'Rename current identity',
        worldDetailTitle: 'World & memory',
        worldDetailBody: 'Choose background references for this chat. Complex activation rules remain in the full editor.',
        activeWorlds: 'Active world references',
        activeWorldsHelp: 'Multiple selections are allowed. Selected lorebooks can contribute content using keywords and rules.',
        recursiveWorld: 'Allow references to trigger each other',
        recursiveWorldHelp: 'When one entry mentions another keyword, related entries may also be included.',
        manageWorlds: 'Open the full world reference editor',
    },
};

let settingsOverlay;
let settingsLauncher;
let lastFocusedElement;
let closeTimer;
let activeDetail;
let detailBindingController;
let detailObservers = [];
let lastReplyPresetSnapshot;

/**
 * Determine which of the two built-in Leslie translations to display.
 * @returns {'zh' | 'en'} The Leslie copy locale.
 */
function getCopyLocale() {
    const selectedLanguage = document.getElementById('ui_language_select')?.value;
    const savedLanguage = localStorage.getItem('language');
    const language = selectedLanguage || savedLanguage || navigator.language || document.documentElement.lang || 'en';
    return language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * Convert a normalized connection state into the short settings label.
 * @param {{ connected: boolean, configured: boolean, checking: boolean }} connectionState Leslie connection state.
 * @param {Record<string, string>} copy Active UI copy.
 * @returns {string} Visible status label.
 */
function getConnectionStatusText(connectionState, copy) {
    if (connectionState.checking) {
        return copy.checking;
    }
    if (connectionState.connected) {
        return copy.connected;
    }
    return connectionState.configured ? copy.configured : copy.disconnected;
}

/**
 * Render one row that opens an existing SillyTavern drawer.
 * @param {object} options Row configuration.
 * @param {string} [options.target] Existing drawer holder id.
 * @param {string} [options.detail] Leslie detail page id.
 * @param {string} options.icon Font Awesome icon class.
 * @param {string} options.title Visible title.
 * @param {string} options.body Explanatory text.
 * @param {boolean} [options.connectionStatus] Show the live API status pill.
 * @returns {string} Row markup.
 */
function renderSettingsRow({ target, detail, icon, title, body, connectionStatus = false }) {
    const copy = COPY[getCopyLocale()];
    const connectionState = connectionStatus ? getLeslieConnectionState() : undefined;
    const status = connectionStatus
        ? `<span class="leslie-settings-status is-${connectionState.state}" data-leslie-connection-status>${getConnectionStatusText(connectionState, copy)}</span>`
        : '';
    const action = detail ? `data-leslie-detail="${detail}"` : `data-leslie-drawer-target="${target}"`;

    return `
        <button type="button" class="leslie-settings-row" ${action}>
            <span class="leslie-settings-row-icon ${icon}" aria-hidden="true"></span>
            <span class="leslie-settings-row-copy">
                <span class="leslie-settings-row-title">${title}</span>
                <span class="leslie-settings-row-description">${body}</span>
            </span>
            ${status}
            <span class="leslie-settings-row-action">
                <span>${copy.open}</span>
                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </span>
        </button>`;
}

const MODEL_SERVICES = {
    deepseek: {
        kind: 'online', mainApi: 'openai', secondaryId: 'chat_completion_source', secondaryValue: 'deepseek', connectId: 'api_button_openai', icon: 'fa-solid fa-brain',
        fields: [
            ['api_key_deepseek', 'leslie-model-key', 'apiKey', 'apiKeyHelp', 'password'],
            ['model_deepseek_select', 'leslie-model-select', 'model', 'modelHelp', 'select'],
        ],
    },
    openai: {
        kind: 'online', mainApi: 'openai', secondaryId: 'chat_completion_source', secondaryValue: 'openai', connectId: 'api_button_openai', icon: 'fa-solid fa-cloud',
        fields: [
            ['api_key_openai', 'leslie-model-key', 'apiKey', 'apiKeyHelp', 'password'],
            ['model_openai_select', 'leslie-model-select', 'model', 'modelHelp', 'select'],
        ],
    },
    openrouter: {
        kind: 'online', mainApi: 'openai', secondaryId: 'chat_completion_source', secondaryValue: 'openrouter', connectId: 'api_button_openai', icon: 'fa-solid fa-route',
        fields: [
            ['api_key_openrouter', 'leslie-model-key', 'apiKey', 'apiKeyHelp', 'password'],
            ['model_openrouter_select', 'leslie-model-select', 'model', 'modelHelp', 'select'],
        ],
    },
    claude: {
        kind: 'online', mainApi: 'openai', secondaryId: 'chat_completion_source', secondaryValue: 'claude', connectId: 'api_button_openai', icon: 'fa-solid fa-a',
        fields: [
            ['api_key_claude', 'leslie-model-key', 'apiKey', 'apiKeyHelp', 'password'],
            ['model_claude_select', 'leslie-model-select', 'model', 'modelHelp', 'select'],
        ],
    },
    makersuite: {
        kind: 'online', mainApi: 'openai', secondaryId: 'chat_completion_source', secondaryValue: 'makersuite', connectId: 'api_button_openai', icon: 'fa-brands fa-google',
        fields: [
            ['api_key_makersuite', 'leslie-model-key', 'apiKey', 'apiKeyHelp', 'password'],
            ['model_google_select', 'leslie-model-select', 'model', 'modelHelp', 'select'],
        ],
    },
    custom: {
        kind: 'online', mainApi: 'openai', secondaryId: 'chat_completion_source', secondaryValue: 'custom', connectId: 'api_button_openai', icon: 'fa-solid fa-link',
        fields: [
            ['custom_api_url_text', 'leslie-model-endpoint', 'endpoint', 'endpointHelp', 'text'],
            ['api_key_custom', 'leslie-model-key', 'apiKey', 'apiKeyHelp', 'password'],
            ['custom_model_id', 'leslie-model-id', 'model', 'modelHelp', 'text'],
            ['model_custom_select', 'leslie-model-select', 'availableModel', 'modelHelp', 'select'],
        ],
    },
    ollama: {
        kind: 'local', mainApi: 'textgenerationwebui', secondaryId: 'textgen_type', secondaryValue: 'ollama', connectId: 'api_button_textgenerationwebui', icon: 'fa-solid fa-computer',
        fields: [
            ['ollama_api_url_text', 'leslie-model-endpoint', 'endpoint', 'endpointHelp', 'text'],
            ['ollama_model', 'leslie-model-select', 'model', 'modelHelp', 'select'],
        ],
    },
    llamacpp: {
        kind: 'local', mainApi: 'textgenerationwebui', secondaryId: 'textgen_type', secondaryValue: 'llamacpp', connectId: 'api_button_textgenerationwebui', icon: 'fa-solid fa-microchip',
        fields: [
            ['llamacpp_api_url_text', 'leslie-model-endpoint', 'endpoint', 'endpointHelp', 'text'],
            ['llamacpp_model', 'leslie-model-select', 'model', 'modelHelp', 'select'],
        ],
    },
    koboldcpp: {
        kind: 'local', mainApi: 'textgenerationwebui', secondaryId: 'textgen_type', secondaryValue: 'koboldcpp', connectId: 'api_button_textgenerationwebui', icon: 'fa-solid fa-dragon',
        fields: [
            ['koboldcpp_api_url_text', 'leslie-model-endpoint', 'endpoint', 'endpointHelp', 'text'],
        ],
    },
    ooba: {
        kind: 'local', mainApi: 'textgenerationwebui', secondaryId: 'textgen_type', secondaryValue: 'ooba', connectId: 'api_button_textgenerationwebui', icon: 'fa-solid fa-terminal',
        fields: [
            ['textgenerationwebui_api_url_text', 'leslie-model-endpoint', 'endpoint', 'endpointHelp', 'text'],
        ],
    },
    generic: {
        kind: 'local', mainApi: 'textgenerationwebui', secondaryId: 'textgen_type', secondaryValue: 'generic', connectId: 'api_button_textgenerationwebui', icon: 'fa-solid fa-network-wired',
        fields: [
            ['generic_api_url_text', 'leslie-model-endpoint', 'endpoint', 'endpointHelp', 'text'],
            ['generic_model_textgenerationwebui', 'leslie-model-id', 'model', 'modelHelp', 'text'],
        ],
    },
};

let activeModelKind;

const REPLY_STYLE_PRESETS = {
    balanced: {
        length: 500,
        temperature: 0.85,
        icon: 'fa-solid fa-scale-balanced',
        titleKey: 'styleBalanced',
        bodyKey: 'styleBalancedBody',
        tagKey: 'styleBalancedTag',
    },
    novel: {
        length: 1500,
        temperature: 1.05,
        icon: 'fa-solid fa-book-open',
        titleKey: 'styleNovel',
        bodyKey: 'styleNovelBody',
        tagKey: 'styleNovelTag',
    },
    dialogue: {
        length: 360,
        temperature: 0.92,
        icon: 'fa-solid fa-comments',
        titleKey: 'styleDialogue',
        bodyKey: 'styleDialogueBody',
        tagKey: 'styleDialogueTag',
    },
    concise: {
        length: 180,
        temperature: 0.65,
        icon: 'fa-solid fa-bolt',
        titleKey: 'styleConcise',
        bodyKey: 'styleConciseBody',
        tagKey: 'styleConciseTag',
    },
};

/**
 * Escape dynamic labels before inserting them into Leslie markup.
 * @param {string} value Dynamic text.
 * @returns {string} HTML-safe text.
 */
function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\u0027', '&#039;');
}

/**
 * Render the shared header and card container used by a detail page.
 * @param {object} options Detail page content.
 * @param {string} options.icon Font Awesome icon class.
 * @param {string} options.title Detail page title.
 * @param {string} options.body Detail page explanation.
 * @param {string} options.content Detail page markup.
 * @returns {string} Detail page markup.
 */
function renderDetailShell({ icon, title, body, content }) {
    const copy = COPY[getCopyLocale()];
    return `
        <div class="leslie-detail-toolbar">
            <button type="button" class="leslie-detail-back" data-leslie-detail-back>
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
                <span>${copy.back}</span>
            </button>
            <span class="leslie-detail-mode">${copy.simpleDetail}</span>
        </div>
        <header class="leslie-detail-hero">
            <span class="leslie-detail-hero-icon ${icon}" aria-hidden="true"></span>
            <div>
                <h2>${title}</h2>
                <p>${body}</p>
            </div>
        </header>
        <div class="leslie-detail-content">${content}</div>`;
}

/**
 * Render one labeled input in a detail card when its original control exists.
 * @param {object} options Field configuration.
 * @param {string} options.sourceId Original control id.
 * @param {string} options.mirrorId Leslie control id.
 * @param {string} options.label Visible field label.
 * @param {string} options.help Visible field explanation.
 * @param {'text' | 'password' | 'select' | 'textarea'} options.kind Mirror control kind.
 * @param {boolean} [options.multiple] Whether a select allows multiple values.
 * @returns {string} Field markup or an empty string.
 */
function renderDetailField({ sourceId, mirrorId, label, help, kind, multiple = false }) {
    if (!document.getElementById(sourceId)) {
        return '';
    }

    let control = `<input id="${mirrorId}" type="${kind}" autocomplete="off">`;
    if (kind === 'password') {
        control = `<input id="${mirrorId}" type="password" autocomplete="new-password" placeholder="••••••••">`;
    } else if (kind === 'select') {
        control = `<select id="${mirrorId}"${multiple ? ' multiple size="5"' : ''}></select>`;
    } else if (kind === 'textarea') {
        control = `<textarea id="${mirrorId}" rows="6"></textarea>`;
    }

    return `
        <label class="leslie-detail-field" for="${mirrorId}">
            <span class="leslie-detail-field-copy">
                <strong>${label}</strong>
                <small>${help}</small>
            </span>
            ${control}
        </label>`;
}

/**
 * Identify a common model connection without changing the active API.
 * @returns {string | undefined} Leslie service id.
 */
function getActiveModelService() {
    const mainApi = document.getElementById('main_api')?.value;
    return Object.entries(MODEL_SERVICES).find(([, service]) => {
        return mainApi === service.mainApi
            && document.getElementById(service.secondaryId)?.value === service.secondaryValue;
    })?.[0];
}

/**
 * Render the model connection detail page.
 * @returns {string} Page markup.
 */
function renderModelDetail() {
    const copy = COPY[getCopyLocale()];
    const activeService = getActiveModelService();
    activeModelKind ??= MODEL_SERVICES[activeService]?.kind || 'online';
    const serviceCopy = {
        deepseek: [copy.serviceDeepSeek, copy.serviceDeepSeekBody],
        custom: [copy.serviceCustom, copy.serviceCustomBody],
        openrouter: [copy.serviceOpenRouter, copy.serviceOpenRouterBody],
        ollama: [copy.serviceOllama, copy.serviceOllamaBody],
        openai: [copy.serviceOpenAI, copy.serviceOpenAIBody],
        claude: [copy.serviceClaude, copy.serviceClaudeBody],
        makersuite: [copy.serviceGemini, copy.serviceGeminiBody],
        llamacpp: [copy.serviceLlamaCpp, copy.serviceLlamaCppBody],
        koboldcpp: [copy.serviceKoboldCpp, copy.serviceKoboldCppBody],
        ooba: [copy.serviceTextGen, copy.serviceTextGenBody],
        generic: [copy.serviceLocalGeneric, copy.serviceLocalGenericBody],
    };
    const kindOptions = [
        ['online', 'fa-solid fa-cloud', copy.onlineApi, copy.onlineApiBody],
        ['local', 'fa-solid fa-computer', copy.localApi, copy.localApiBody],
    ].map(([kind, icon, title, body]) => `
        <button type="button" class="leslie-api-kind-card${kind === activeModelKind ? ' is-active' : ''}" data-leslie-api-kind="${kind}" aria-pressed="${kind === activeModelKind}">
            <span class="${icon}" aria-hidden="true"></span>
            <span><strong>${title}</strong><small>${body}</small></span>
            <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        </button>`).join('');
    const cards = Object.entries(MODEL_SERVICES).filter(([, service]) => service.kind === activeModelKind).map(([id, service]) => `
        <button type="button" class="leslie-service-card${id === activeService ? ' is-active' : ''}" data-leslie-service="${id}" aria-pressed="${id === activeService}">
            <span class="leslie-service-icon ${service.icon}" aria-hidden="true"></span>
            <span><strong>${serviceCopy[id][0]}</strong><small>${serviceCopy[id][1]}</small></span>
            <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        </button>`).join('');

    const selectedService = MODEL_SERVICES[activeService];
    let fields = `<div class="leslie-detail-callout"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>${copy.chooseProvider}</span></div>`;
    if (selectedService?.kind === activeModelKind) {
        fields = selectedService.fields.map(([sourceId, mirrorId, labelKey, helpKey, kind]) => renderDetailField({
            sourceId,
            mirrorId,
            label: copy[labelKey],
            help: copy[helpKey],
            kind,
        })).join('');
    }

    const connectionState = getLeslieConnectionState();
    const statusText = getConnectionStatusText(connectionState, copy);
    const thinkingMode = selectedService?.mainApi === 'openai' && document.getElementById('openai_show_thoughts') ? `
        <label class="leslie-detail-switch-row" for="leslie-model-thinking-mode">
            <span><strong>${copy.thinkingMode}</strong><small>${copy.thinkingModeHelp}</small></span>
            <input id="leslie-model-thinking-mode" type="checkbox" role="switch">
        </label>` : '';

    const content = `
        <section class="leslie-model-status is-${connectionState.state}" data-leslie-model-status>
            <span class="leslie-connection-dot" aria-hidden="true"></span>
            <strong>${statusText}</strong>
        </section>
        <section class="leslie-detail-card leslie-api-kind-section">
            <div class="leslie-detail-card-heading"><h3>${copy.apiKindTitle}</h3><p>${copy.apiKindBody}</p></div>
            <div class="leslie-api-kind-grid">${kindOptions}</div>
        </section>
        <section class="leslie-detail-card">
            <div class="leslie-detail-card-heading"><h3>${copy.serviceTitle}</h3><p>${copy.serviceBody}</p></div>
            <div class="leslie-service-grid">${cards}</div>
        </section>
        <section class="leslie-detail-card">
            <div class="leslie-detail-grid">${fields}</div>
            ${selectedService?.kind === activeModelKind ? `
                <label class="leslie-detail-switch-row" for="leslie-model-auto-connect">
                    <span><strong>${copy.autoConnect}</strong><small>${copy.autoConnectHelp}</small></span>
                    <input id="leslie-model-auto-connect" type="checkbox" role="switch">
                </label>
                ${thinkingMode}
                <div class="leslie-detail-actions">
                    <span class="leslie-detail-privacy"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>${copy.privacy}</span>
                    <button type="button" class="leslie-settings-primary-button" data-leslie-model-connect>
                        <i class="fa-solid fa-plug" aria-hidden="true"></i><span>${copy.connect}</span>
                    </button>
                </div>` : ''}
        </section>
        <button type="button" class="leslie-detail-full-button" data-leslie-drawer-target="sys-settings-button">
            <span><strong>${copy.allProviders}</strong><small>${copy.fullSettingsHelp}</small></span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </button>`;
    return renderDetailShell({ icon: 'fa-solid fa-plug', title: copy.modelDetailTitle, body: copy.modelDetailBody, content });
}

/**
 * Resolve reply controls for the currently active API family.
 * @returns {{preset?: string, temperature?: string, streaming?: string, responseLength: string, contextSize: string}} Control ids.
 */
function getReplyControlIds() {
    const mainApi = document.getElementById('main_api')?.value;
    if (mainApi === 'openai') {
        return {
            preset: 'settings_preset_openai',
            temperature: 'temp_openai',
            streaming: 'stream_toggle',
            responseLength: 'openai_max_tokens',
            contextSize: 'openai_max_context',
        };
    }
    if (mainApi === 'textgenerationwebui') {
        return {
            preset: 'settings_preset_textgenerationwebui',
            temperature: 'temp_textgenerationwebui',
            streaming: 'streaming_textgenerationwebui',
            responseLength: 'amount_gen',
            contextSize: 'max_context',
        };
    }
    if (mainApi === 'novel') {
        return {
            preset: 'settings_preset_novel',
            temperature: 'temp_novel',
            streaming: 'streaming_novel',
            responseLength: 'amount_gen',
            contextSize: 'max_context',
        };
    }
    return {
        preset: 'settings_preset',
        temperature: 'temp',
        streaming: 'streaming_kobold',
        responseLength: 'amount_gen',
        contextSize: 'max_context',
    };
}

/**
 * Render a range setting with a compact numeric companion input.
 * @param {object} options Range configuration.
 * @param {string} options.sourceId Original range id.
 * @param {string} options.mirrorId Leslie range id.
 * @param {string} options.label Visible label.
 * @param {string} options.help Visible explanation.
 * @returns {string} Range markup or an empty string.
 */
function renderDetailRange({ sourceId, mirrorId, label, help }) {
    if (!document.getElementById(sourceId)) {
        return '';
    }
    return `
        <label class="leslie-detail-field leslie-detail-range-field" for="${mirrorId}">
            <span class="leslie-detail-field-copy"><strong>${label}</strong><small>${help}</small></span>
            <span class="leslie-detail-range-controls">
                <input id="${mirrorId}" type="range">
                <input id="${mirrorId}-number" type="number" aria-label="${label}">
            </span>
        </label>`;
}

/**
 * Constrain a suggested preset value to an original control's supported range.
 * @param {HTMLInputElement} source Original numeric control.
 * @param {number} value Suggested preset value.
 * @returns {number} Supported value.
 */
function clampReplyPresetValue(source, value) {
    const minimum = source.min === '' ? Number.NEGATIVE_INFINITY : Number(source.min);
    const maximum = source.max === '' ? Number.POSITIVE_INFINITY : Number(source.max);
    return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Detect whether current reply values still match one of Leslie's presets.
 * @returns {string | undefined} Matching preset id.
 */
function getActiveReplyStylePreset() {
    const ids = getReplyControlIds();
    const lengthSource = document.getElementById(ids.responseLength);
    const temperatureSource = document.getElementById(ids.temperature);
    if (!(lengthSource instanceof HTMLInputElement) || !(temperatureSource instanceof HTMLInputElement)) {
        return undefined;
    }
    const length = Number(lengthSource.value);
    const temperature = Number(temperatureSource.value);
    return Object.entries(REPLY_STYLE_PRESETS).find(([, preset]) => {
        const expectedLength = clampReplyPresetValue(lengthSource, preset.length);
        const expectedTemperature = clampReplyPresetValue(temperatureSource, preset.temperature);
        return Math.abs(length - expectedLength) < 1 && Math.abs(temperature - expectedTemperature) < 0.011;
    })?.[0];
}

/**
 * Render the scene-based reply presets.
 * @returns {string} Preset card markup.
 */
function renderReplyStylePresets() {
    const copy = COPY[getCopyLocale()];
    const activePreset = getActiveReplyStylePreset();
    const cards = Object.entries(REPLY_STYLE_PRESETS).map(([id, preset]) => `
        <button type="button" class="leslie-style-preset${id === activePreset ? ' is-active' : ''}" data-leslie-reply-style="${id}" aria-pressed="${id === activePreset}">
            <span class="leslie-style-preset-icon ${preset.icon}" aria-hidden="true"></span>
            <span class="leslie-style-preset-copy">
                <strong>${copy[preset.titleKey]}</strong>
                <small>${copy[preset.bodyKey]}</small>
                <em>${copy[preset.tagKey]}</em>
            </span>
            <span class="leslie-style-preset-check fa-solid fa-check" aria-hidden="true"></span>
        </button>`).join('');
    return `
        <section class="leslie-detail-card leslie-style-presets-card">
            <div class="leslie-detail-card-heading">
                <h3>${copy.stylePresetsTitle}</h3>
                <p>${copy.stylePresetsBody}</p>
            </div>
            <div class="leslie-style-presets">${cards}</div>
            <div class="leslie-style-preset-note"><i class="fa-solid fa-shield-heart" aria-hidden="true"></i><span>${copy.stylePresetsSafe}</span></div>
            <div class="leslie-style-preset-feedback" aria-live="polite">
                <span data-leslie-preset-feedback>${activePreset ? `${copy.styleApplied}“${copy[REPLY_STYLE_PRESETS[activePreset].titleKey]}”${copy.styleAppliedTail}` : `${copy.styleCustom}`}</span>
                <button type="button" data-leslie-preset-undo${lastReplyPresetSnapshot ? '' : ' hidden'}><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>${copy.undoPreset}</button>
            </div>
        </section>`;
}

/**
 * Render the reply-style detail page.
 * @returns {string} Page markup.
 */
function renderReplyDetail() {
    const copy = COPY[getCopyLocale()];
    const ids = getReplyControlIds();
    const controls = [
        renderDetailField({ sourceId: ids.preset, mirrorId: 'leslie-reply-preset', label: copy.preset, help: copy.presetHelp, kind: 'select' }),
        renderDetailRange({ sourceId: ids.responseLength, mirrorId: 'leslie-reply-length', label: copy.responseLength, help: copy.responseLengthHelp }),
        renderDetailRange({ sourceId: ids.contextSize, mirrorId: 'leslie-reply-context', label: copy.contextSize, help: copy.contextSizeHelp }),
        renderDetailRange({ sourceId: ids.temperature, mirrorId: 'leslie-reply-creativity', label: copy.creativity, help: copy.creativityHelp }),
    ].join('');
    const streaming = document.getElementById(ids.streaming) ? `
        <label class="leslie-detail-switch-row" for="leslie-reply-streaming">
            <span><strong>${copy.streaming}</strong><small>${copy.streamingHelp}</small></span>
            <input id="leslie-reply-streaming" type="checkbox" role="switch">
        </label>` : '';
    const emptyNote = controls || streaming ? '' : `<div class="leslie-detail-callout"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>${copy.settingUnavailable}</span></div>`;
    const content = `
        ${renderReplyStylePresets()}
        <section class="leslie-detail-card">
            <div class="leslie-detail-grid">${controls}${emptyNote}</div>
            ${streaming}
        </section>
        <button type="button" class="leslie-detail-full-button" data-leslie-drawer-target="ai-config-button">
            <span><strong>${copy.advancedReply}</strong><small>${copy.fullSettingsHelp}</small></span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </button>`;
    return renderDetailShell({ icon: 'fa-solid fa-wand-magic-sparkles', title: copy.replyDetailTitle, body: copy.replyDetailBody, content });
}

/**
 * Read the current character name from SillyTavern's existing UI.
 * @returns {string} Current character label.
 */
function getCurrentCharacterName() {
    const copy = COPY[getCopyLocale()];
    return document.querySelector('#rm_button_selected_ch h2')?.textContent?.trim()
        || document.getElementById('character_name_pole')?.textContent?.trim()
        || copy.noCharacter;
}

/**
 * Render the character and chat detail page.
 * @returns {string} Page markup.
 */
function renderCharacterDetail() {
    const copy = COPY[getCopyLocale()];
    const content = `
        <section class="leslie-detail-card leslie-character-summary">
            <span class="leslie-character-avatar fa-solid fa-user" aria-hidden="true"></span>
            <div><small>${copy.currentCharacter}</small><strong data-leslie-character-name>${escapeHtml(getCurrentCharacterName())}</strong><p>${copy.characterGuide}</p></div>
        </section>
        <div class="leslie-character-actions">
            <button type="button" data-leslie-open-character-list><i class="fa-solid fa-address-book" aria-hidden="true"></i><span>${copy.chooseCharacter}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
            <button type="button" data-leslie-drawer-target="rightNavHolder"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i><span>${copy.editCharacter}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
            <button type="button" data-leslie-detail="persona"><i class="fa-solid fa-face-smile" aria-hidden="true"></i><span>${copy.goPersona}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
            <button type="button" data-leslie-detail="world"><i class="fa-solid fa-book-atlas" aria-hidden="true"></i><span>${copy.goWorld}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
        </div>`;
    return renderDetailShell({ icon: 'fa-solid fa-address-card', title: copy.characterDetailTitle, body: copy.characterDetailBody, content });
}

/**
 * Render the persona detail page.
 * @returns {string} Page markup.
 */
function renderPersonaDetail() {
    const copy = COPY[getCopyLocale()];
    const personaName = document.getElementById('your_name')?.textContent?.trim() || copy.noPersona;
    const content = `
        <section class="leslie-detail-card leslie-persona-summary">
            <span class="leslie-character-avatar fa-solid fa-face-smile" aria-hidden="true"></span>
            <div><small>${copy.currentPersona}</small><strong data-leslie-persona-name>${escapeHtml(personaName)}</strong></div>
        </section>
        <section class="leslie-detail-card">
            <div class="leslie-detail-grid">
                ${renderDetailField({ sourceId: 'persona_description', mirrorId: 'leslie-persona-description', label: copy.personaDescription, help: copy.personaDescriptionHelp, kind: 'textarea' })}
                ${renderDetailField({ sourceId: 'persona_description_position', mirrorId: 'leslie-persona-position', label: copy.personaPosition, help: copy.personaPositionHelp, kind: 'select' })}
            </div>
            ${document.getElementById('persona_auto_lock') ? `
                <label class="leslie-detail-switch-row" for="leslie-persona-lock">
                    <span><strong>${copy.autoLockPersona}</strong><small>${copy.autoLockPersonaHelp}</small></span>
                    <input id="leslie-persona-lock" type="checkbox" role="switch">
                </label>` : ''}
        </section>
        <div class="leslie-detail-button-grid">
            <button type="button" class="leslie-detail-full-button" data-leslie-drawer-target="persona-management-button"><span><strong>${copy.managePersonas}</strong></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
            <button type="button" class="leslie-detail-full-button" data-leslie-source-click="persona_rename_button"><span><strong>${copy.renamePersona}</strong></span><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
        </div>`;
    return renderDetailShell({ icon: 'fa-solid fa-face-smile', title: copy.personaDetailTitle, body: copy.personaDetailBody, content });
}

/**
 * Render the world and memory detail page.
 * @returns {string} Page markup.
 */
function renderWorldDetail() {
    const copy = COPY[getCopyLocale()];
    const content = `
        <section class="leslie-detail-card">
            <div class="leslie-detail-grid">
                ${renderDetailField({ sourceId: 'world_info', mirrorId: 'leslie-world-info', label: copy.activeWorlds, help: copy.activeWorldsHelp, kind: 'select', multiple: true })}
            </div>
            ${document.getElementById('world_info_recursive') ? `
                <label class="leslie-detail-switch-row" for="leslie-world-recursive">
                    <span><strong>${copy.recursiveWorld}</strong><small>${copy.recursiveWorldHelp}</small></span>
                    <input id="leslie-world-recursive" type="checkbox" role="switch">
                </label>` : ''}
        </section>
        <button type="button" class="leslie-detail-full-button" data-leslie-drawer-target="WI-SP-button">
            <span><strong>${copy.manageWorlds}</strong><small>${copy.fullSettingsHelp}</small></span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </button>`;
    return renderDetailShell({ icon: 'fa-solid fa-book-atlas', title: copy.worldDetailTitle, body: copy.worldDetailBody, content });
}

/** @returns {string} Volcengine character voice detail page. */
function renderVoiceDetail() {
    const copy = COPY[getCopyLocale()];
    const content = `<leslie-voice-settings data-locale="${getCopyLocale()}"></leslie-voice-settings>`;
    return renderDetailShell({ icon: 'fa-solid fa-volume-high', title: copy.voiceDetailTitle, body: copy.voiceDetailBody, content });
}

const DETAIL_RENDERERS = {
    model: renderModelDetail,
    reply: renderReplyDetail,
    voice: renderVoiceDetail,
    character: renderCharacterDetail,
    persona: renderPersonaDetail,
    world: renderWorldDetail,
};

/**
 * Build the settings hub using user-facing language and real drawer targets.
 * @returns {HTMLElement} The overlay element.
 */
function createSettingsOverlay() {
    const copy = COPY[getCopyLocale()];
    const overlay = document.createElement('div');
    overlay.id = 'leslie-settings-overlay';
    overlay.className = 'leslie-settings-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
        <section class="leslie-settings-panel" role="main" aria-labelledby="leslie-settings-title">
            <div class="leslie-settings-layout">
                <aside class="leslie-settings-master">
                    <header class="leslie-settings-header">
                        <div class="leslie-settings-heading">
                            <span class="leslie-settings-logo fa-solid fa-sliders" aria-hidden="true"></span>
                            <span>
                                <small>${copy.subtitle}</small>
                                <strong id="leslie-settings-title">${copy.settings}</strong>
                            </span>
                        </div>
                        <button type="button" class="leslie-settings-close fa-solid fa-arrow-left" data-leslie-settings-close aria-label="${copy.backToChat}" title="${copy.backToChat}"></button>
                    </header>
                <nav class="leslie-settings-navigation" aria-label="${copy.navigation}">
                    <div class="leslie-settings-navigation-heading">
                        <span>${copy.navigation}</span>
                        <small>${copy.subtitle}</small>
                    </div>
                    <div class="leslie-settings-navigation-group">
                        <button type="button" class="leslie-settings-nav-item active" data-leslie-settings-home data-leslie-settings-page="overview" aria-current="page">
                            <i class="fa-solid fa-sliders" aria-hidden="true"></i>
                            <span><strong>${copy.overviewTitle}</strong><small>${copy.overviewBody}</small></span>
                        </button>
                    </div>
                    <div class="leslie-settings-navigation-group">
                        <span class="leslie-settings-navigation-label">${copy.coreGroup}</span>
                        <button type="button" class="leslie-settings-nav-item" data-leslie-detail="model" data-leslie-settings-page="model">
                            <i class="fa-solid fa-plug" aria-hidden="true"></i>
                            <span><strong>${copy.modelTitle}</strong><small>${copy.modelBody}</small></span>
                        </button>
                        <button type="button" class="leslie-settings-nav-item" data-leslie-detail="reply" data-leslie-settings-page="reply">
                            <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                            <span><strong>${copy.replyTitle}</strong><small>${copy.replyBody}</small></span>
                        </button>
                        <button type="button" class="leslie-settings-nav-item" data-leslie-detail="voice" data-leslie-settings-page="voice">
                            <i class="fa-solid fa-volume-high" aria-hidden="true"></i>
                            <span><strong>${copy.voiceTitle}</strong><small>${copy.voiceBody}</small></span>
                        </button>
                    </div>
                    <div class="leslie-settings-navigation-group">
                        <span class="leslie-settings-navigation-label">${copy.roleGroup}</span>
                        <button type="button" class="leslie-settings-nav-item" data-leslie-detail="character" data-leslie-settings-page="character">
                            <i class="fa-solid fa-address-card" aria-hidden="true"></i>
                            <span><strong>${copy.characterTitle}</strong><small>${copy.characterBody}</small></span>
                        </button>
                        <button type="button" class="leslie-settings-nav-item" data-leslie-detail="persona" data-leslie-settings-page="persona">
                            <i class="fa-solid fa-face-smile" aria-hidden="true"></i>
                            <span><strong>${copy.personaTitle}</strong><small>${copy.personaBody}</small></span>
                        </button>
                        <button type="button" class="leslie-settings-nav-item" data-leslie-detail="world" data-leslie-settings-page="world">
                            <i class="fa-solid fa-book-atlas" aria-hidden="true"></i>
                            <span><strong>${copy.worldTitle}</strong><small>${copy.worldBody}</small></span>
                        </button>
                    </div>
                    <div class="leslie-settings-navigation-group leslie-settings-navigation-advanced">
                        <span class="leslie-settings-navigation-label">${copy.advancedGroup}</span>
                        <button type="button" class="leslie-settings-nav-item" data-leslie-settings-anchor="advanced" data-leslie-settings-page="advanced">
                            <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
                            <span><strong>${copy.advancedTitle}</strong><small>${copy.advancedBody}</small></span>
                        </button>
                    </div>
                </nav>
                </aside>

                <section class="leslie-settings-content-pane" aria-labelledby="leslie-settings-content-title">
                <header class="leslie-settings-content-header">
                    <button type="button" class="leslie-settings-content-back" data-leslie-settings-nav-back aria-label="${copy.navigation}" title="${copy.navigation}">
                        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
                    </button>
                    <div class="leslie-settings-content-heading">
                        <small>${copy.contentEyebrow}</small>
                        <strong id="leslie-settings-content-title">${copy.overviewTitle}</strong>
                    </div>
                    <span class="leslie-settings-content-save"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>${copy.originalSave}</span></span>
                </header>
                <div class="leslie-settings-scroll">
                <div id="leslie-settings-home" class="leslie-settings-home">
                <section class="leslie-settings-intro">
                    <div>
                        <span class="leslie-settings-eyebrow">${copy.introEyebrow}</span>
                        <h2>${copy.introTitle}</h2>
                        <p>${copy.introBody}</p>
                    </div>
                    <div class="leslie-settings-safe-note">
                        <i class="fa-solid fa-shield-heart" aria-hidden="true"></i>
                        <span>${copy.safeNote}</span>
                    </div>
                </section>

                <div class="leslie-settings-columns">
                    <main class="leslie-settings-main">
                        <section class="leslie-settings-section leslie-settings-quick-section">
                            <div class="leslie-settings-section-heading">
                                <div>
                                    <h3>${copy.quickTitle}</h3>
                                    <p>${copy.quickBody}</p>
                                </div>
                            </div>
                            <div class="leslie-settings-quick-grid">
                                <label class="leslie-quick-control" for="leslie-theme-select">
                                    <span>
                                        <strong>${copy.theme}</strong>
                                        <small>${copy.themeHelp}</small>
                                    </span>
                                    <select id="leslie-theme-select" aria-label="${copy.theme}"></select>
                                </label>
                                <label class="leslie-quick-control" for="leslie-language-select">
                                    <span>
                                        <strong>${copy.language}</strong>
                                        <small>${copy.languageHelp}</small>
                                    </span>
                                    <select id="leslie-language-select" aria-label="${copy.language}"></select>
                                </label>
                                <label class="leslie-quick-control leslie-quick-toggle" for="leslie-reduced-motion">
                                    <span>
                                        <strong>${copy.reducedMotion}</strong>
                                        <small>${copy.reducedMotionHelp}</small>
                                    </span>
                                    <input id="leslie-reduced-motion" type="checkbox" role="switch">
                                </label>
                                <label class="leslie-quick-control leslie-quick-toggle" for="leslie-fast-ui">
                                    <span>
                                        <strong>${copy.performance}</strong>
                                        <small>${copy.performanceHelp}</small>
                                    </span>
                                    <input id="leslie-fast-ui" type="checkbox" role="switch">
                                </label>
                            </div>
                        </section>

                        <section class="leslie-settings-section leslie-settings-essentials-section">
                            <div class="leslie-settings-section-heading">
                                <div>
                                    <h3>${copy.essentialsTitle}</h3>
                                    <p>${copy.essentialsBody}</p>
                                </div>
                            </div>
                            <div class="leslie-settings-list">
                                ${renderSettingsRow({ detail: 'model', icon: 'fa-solid fa-plug', title: copy.modelTitle, body: copy.modelBody, connectionStatus: true })}
                                ${renderSettingsRow({ detail: 'reply', icon: 'fa-solid fa-wand-magic-sparkles', title: copy.replyTitle, body: copy.replyBody })}
                                ${renderSettingsRow({ detail: 'voice', icon: 'fa-solid fa-volume-high', title: copy.voiceTitle, body: copy.voiceBody })}
                                ${renderSettingsRow({ detail: 'character', icon: 'fa-solid fa-address-card', title: copy.characterTitle, body: copy.characterBody })}
                                ${renderSettingsRow({ detail: 'persona', icon: 'fa-solid fa-face-smile', title: copy.personaTitle, body: copy.personaBody })}
                                ${renderSettingsRow({ detail: 'world', icon: 'fa-solid fa-book-atlas', title: copy.worldTitle, body: copy.worldBody })}
                            </div>
                        </section>
                    </main>

                    <aside id="leslie-advanced-vault" class="leslie-settings-section leslie-advanced-vault">
                        <div class="leslie-settings-section-heading">
                            <div>
                                <span class="leslie-settings-eyebrow">${copy.advancedTitle}</span>
                                <h3>${copy.advancedTitle}</h3>
                                <p>${copy.advancedBody}</p>
                            </div>
                            <button type="button" id="leslie-advanced-relock" class="leslie-settings-text-button" hidden>
                                <i class="fa-solid fa-lock" aria-hidden="true"></i>
                                <span>${copy.relock}</span>
                            </button>
                        </div>
                        <div class="leslie-advanced-preview" aria-hidden="true">
                            ${renderSettingsRow({ target: 'advanced-formatting-button', icon: 'fa-solid fa-code-branch', title: copy.promptTitle, body: copy.promptBody })}
                            ${renderSettingsRow({ target: 'extensions-settings-button', icon: 'fa-solid fa-cubes', title: copy.extensionsTitle, body: copy.extensionsBody })}
                            ${renderSettingsRow({ target: 'backgrounds-button', icon: 'fa-solid fa-panorama', title: copy.backgroundTitle, body: copy.backgroundBody })}
                            ${renderSettingsRow({ target: 'user-settings-button', icon: 'fa-solid fa-sliders', title: copy.fullSettingsTitle, body: copy.fullSettingsBody })}
                        </div>
                        <div class="leslie-advanced-lock">
                            <span class="leslie-advanced-lock-icon fa-solid fa-lock" aria-hidden="true"></span>
                            <h4>${copy.lockedTitle}</h4>
                            <p>${copy.lockedBody}</p>
                            <button type="button" id="leslie-advanced-unlock" class="leslie-settings-primary-button">
                                <i class="fa-solid fa-unlock-keyhole" aria-hidden="true"></i>
                                <span>${copy.unlock}</span>
                            </button>
                        </div>
                    </aside>
                </div>

                <p class="leslie-settings-footer-note">
                    <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
                    <span>${copy.footer}</span>
                </p>
                </div>
                <section id="leslie-settings-detail" class="leslie-settings-detail" hidden></section>
                </div>
                </section>
            </div>
        </section>`;

    return overlay;
}

/**
 * Close any unpinned SillyTavern drawer before opening the settings hub.
 */
function closeOpenDrawers() {
    document.querySelectorAll('.openIcon:not(.drawerPinnedOpen)').forEach((icon) => {
        icon.classList.remove('openIcon');
        icon.classList.add('closedIcon');
    });
    document.querySelectorAll('.openDrawer:not(.pinnedOpen)').forEach((drawer) => {
        drawer.classList.remove('openDrawer');
        drawer.classList.add('closedDrawer');
    });
}

/**
 * Reveal the simple settings hub and move keyboard focus into it.
 */
function openSettings() {
    window.clearTimeout(closeTimer);
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : settingsLauncher;
    closeOpenDrawers();
    showSettingsHome();
    settingsOverlay.classList.remove('leslie-settings-mobile-detail');
    settingsOverlay.hidden = false;
    document.documentElement.classList.add('leslie-settings-open');
    document.body.classList.add('leslie-settings-open');
    requestAnimationFrame(() => {
        settingsOverlay.dataset.open = 'true';
        settingsOverlay.querySelector('[data-leslie-settings-close]:not(.leslie-settings-backdrop)')?.focus();
    });
}

/**
 * Hide the settings hub and restore focus to its launcher.
 */
function closeSettings() {
    settingsOverlay.dataset.open = 'false';
    settingsOverlay.classList.remove('leslie-settings-mobile-detail');
    document.documentElement.classList.remove('leslie-settings-open');
    document.body.classList.remove('leslie-settings-open');
    lockAdvancedSettings();
    closeTimer = window.setTimeout(() => {
        settingsOverlay.hidden = true;
        showSettingsHome();
        lastFocusedElement?.focus();
    }, 180);
}

/**
 * Open an original drawer so its established controls and save handlers remain
 * responsible for every setting change.
 * @param {string} targetId Existing drawer holder id.
 * @param {string} [afterOpenId] Optional original control to click after opening.
 */
function openOriginalDrawer(targetId, afterOpenId) {
    const target = document.getElementById(targetId);
    const drawer = target?.querySelector('.drawer-content');
    const toggle = target?.querySelector('.drawer-toggle');
    const icon = toggle?.querySelector('.drawer-icon');

    if (!target || !drawer || !toggle) {
        return;
    }

    closeSettings();
    window.setTimeout(() => {
        if (!drawer.classList.contains('openDrawer')) {
            (icon || toggle).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
        if (afterOpenId) {
            window.setTimeout(() => document.getElementById(afterOpenId)?.click(), 80);
        }
    }, 210);
}

/**
 * Close Leslie settings before triggering an original standalone action.
 * @param {string} sourceId Existing SillyTavern control id.
 */
function clickOriginalControl(sourceId) {
    closeSettings();
    window.setTimeout(() => document.getElementById(sourceId)?.click(), 210);
}

/**
 * Make the guarded advanced rows available for the current settings visit.
 */
function unlockAdvancedSettings() {
    const vault = document.getElementById('leslie-advanced-vault');
    const preview = vault?.querySelector('.leslie-advanced-preview');
    const relockButton = document.getElementById('leslie-advanced-relock');
    vault?.classList.add('is-unlocked');
    preview?.setAttribute('aria-hidden', 'false');
    preview?.querySelectorAll('button').forEach((button) => button.removeAttribute('tabindex'));
    if (relockButton) {
        relockButton.hidden = false;
    }
    preview?.querySelector('button')?.focus();
}

/**
 * Return the advanced area to its default guarded state.
 */
function lockAdvancedSettings() {
    const vault = document.getElementById('leslie-advanced-vault');
    const preview = vault?.querySelector('.leslie-advanced-preview');
    const relockButton = document.getElementById('leslie-advanced-relock');
    vault?.classList.remove('is-unlocked');
    preview?.setAttribute('aria-hidden', 'true');
    preview?.querySelectorAll('button').forEach((button) => button.setAttribute('tabindex', '-1'));
    if (relockButton) {
        relockButton.hidden = true;
    }
}

/**
 * Keep a Leslie select synchronized with an existing SillyTavern select.
 * @param {string} sourceId Existing select id.
 * @param {string} mirrorId Leslie select id.
 */
function mirrorSelect(sourceId, mirrorId) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (!(source instanceof HTMLSelectElement) || !(mirror instanceof HTMLSelectElement)) {
        return;
    }

    const syncFromSource = () => {
        const optionsChanged = source.options.length !== mirror.options.length
            || Array.from(source.options).some((option, index) => mirror.options[index]?.value !== option.value || mirror.options[index]?.text !== option.text);
        if (optionsChanged) {
            mirror.replaceChildren(...Array.from(source.options).map((option) => option.cloneNode(true)));
        }
        mirror.value = source.value;
        mirror.disabled = source.disabled;
    };

    mirror.addEventListener('change', () => {
        source.value = mirror.value;
        source.dispatchEvent(new Event('change', { bubbles: true }));
    });
    source.addEventListener('change', syncFromSource);
    new MutationObserver(syncFromSource).observe(source, { childList: true, subtree: true, attributes: true });
    syncFromSource();
}

/**
 * Keep a Leslie switch synchronized with an existing SillyTavern checkbox.
 * @param {string} sourceId Existing checkbox id.
 * @param {string} mirrorId Leslie checkbox id.
 * @param {'change' | 'input'} sourceEvent Event used by the original handler.
 */
function mirrorCheckbox(sourceId, mirrorId, sourceEvent) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (!(source instanceof HTMLInputElement) || !(mirror instanceof HTMLInputElement)) {
        return;
    }

    const syncFromSource = () => {
        mirror.checked = source.checked;
        mirror.disabled = source.disabled;
    };

    mirror.addEventListener('change', () => {
        source.checked = mirror.checked;
        source.dispatchEvent(new Event(sourceEvent, { bubbles: true }));
    });
    source.addEventListener('change', syncFromSource);
    source.addEventListener('input', syncFromSource);
    new MutationObserver(syncFromSource).observe(source, { attributes: true, attributeFilter: ['checked', 'disabled'] });
    syncFromSource();
}

/**
 * Remove event listeners and observers that belong to the current detail page.
 */
function clearDetailBindings() {
    detailBindingController?.abort();
    detailBindingController = undefined;
    detailObservers.forEach((observer) => observer.disconnect());
    detailObservers = [];
}

/**
 * Observe a source control for changes that should refresh a detail mirror.
 * @param {Element} source Existing SillyTavern control.
 * @param {() => void} update Mirror update callback.
 * @param {string[]} [attributeFilter] Attributes to observe.
 */
function observeDetailSource(source, update, attributeFilter = ['disabled']) {
    const observer = new MutationObserver(update);
    observer.observe(source, { childList: true, subtree: true, attributes: true, attributeFilter });
    detailObservers.push(observer);
}

/**
 * Mirror an original text input or textarea for the lifetime of a detail page.
 * @param {string} sourceId Existing control id.
 * @param {string} mirrorId Leslie control id.
 * @param {'change' | 'input'} sourceEvent Event expected by the original control.
 * @param {object} [options] Binding options.
 * @param {boolean} [options.secret] Do not copy an existing secret into Leslie's input.
 */
function bindDetailInput(sourceId, mirrorId, sourceEvent, { secret = false } = {}) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    const validSource = source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement;
    const validMirror = mirror instanceof HTMLInputElement || mirror instanceof HTMLTextAreaElement;
    if (!validSource || !validMirror || !detailBindingController) {
        return;
    }

    const syncFromSource = () => {
        if (!secret) {
            mirror.value = source.value;
        }
        mirror.disabled = source.disabled;
        ['min', 'max', 'step', 'placeholder'].forEach((attribute) => {
            const value = source.getAttribute(attribute);
            if (value !== null && !secret) {
                mirror.setAttribute(attribute, value);
            }
        });
    };
    mirror.addEventListener(sourceEvent, () => {
        source.value = mirror.value;
        source.dispatchEvent(new Event(sourceEvent, { bubbles: true }));
    }, { signal: detailBindingController.signal });
    source.addEventListener('input', syncFromSource, { signal: detailBindingController.signal });
    source.addEventListener('change', syncFromSource, { signal: detailBindingController.signal });
    observeDetailSource(source, syncFromSource, ['disabled', 'min', 'max', 'step', 'placeholder']);
    syncFromSource();
}

/**
 * Mirror an original select for the lifetime of a detail page.
 * @param {string} sourceId Existing select id.
 * @param {string} mirrorId Leslie select id.
 * @param {'change' | 'input'} sourceEvent Event expected by the original select.
 */
function bindDetailSelect(sourceId, mirrorId, sourceEvent = 'change') {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (!(source instanceof HTMLSelectElement) || !(mirror instanceof HTMLSelectElement) || !detailBindingController) {
        return;
    }

    const syncFromSource = () => {
        const optionsChanged = source.options.length !== mirror.options.length
            || Array.from(source.options).some((option, index) => mirror.options[index]?.value !== option.value || mirror.options[index]?.text !== option.text);
        if (optionsChanged) {
            mirror.replaceChildren(...Array.from(source.options).map((option) => option.cloneNode(true)));
        }
        mirror.multiple = source.multiple;
        Array.from(mirror.options).forEach((option, index) => {
            option.selected = source.options[index]?.selected ?? false;
            option.disabled = source.options[index]?.disabled ?? false;
        });
        mirror.disabled = source.disabled;
    };
    mirror.addEventListener(sourceEvent, () => {
        Array.from(source.options).forEach((option, index) => {
            option.selected = mirror.options[index]?.selected ?? false;
        });
        source.dispatchEvent(new Event(sourceEvent, { bubbles: true }));
    }, { signal: detailBindingController.signal });
    source.addEventListener('change', syncFromSource, { signal: detailBindingController.signal });
    source.addEventListener('input', syncFromSource, { signal: detailBindingController.signal });
    observeDetailSource(source, syncFromSource, ['disabled', 'selected', 'value']);
    syncFromSource();
}

/**
 * Mirror an original checkbox for the lifetime of a detail page.
 * @param {string} sourceId Existing checkbox id.
 * @param {string} mirrorId Leslie checkbox id.
 * @param {'change' | 'input'} sourceEvent Event expected by the original checkbox.
 */
function bindDetailCheckbox(sourceId, mirrorId, sourceEvent = 'input') {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (!(source instanceof HTMLInputElement) || !(mirror instanceof HTMLInputElement) || !detailBindingController) {
        return;
    }

    const syncFromSource = () => {
        mirror.checked = source.checked;
        mirror.disabled = source.disabled;
    };
    mirror.addEventListener('change', () => {
        source.checked = mirror.checked;
        source.dispatchEvent(new Event(sourceEvent, { bubbles: true }));
    }, { signal: detailBindingController.signal });
    source.addEventListener('change', syncFromSource, { signal: detailBindingController.signal });
    source.addEventListener('input', syncFromSource, { signal: detailBindingController.signal });
    observeDetailSource(source, syncFromSource, ['checked', 'disabled']);
    syncFromSource();
}

/**
 * Mirror SillyTavern's existing reasoning switch and remove an explicit effort
 * request when the user asks for direct replies.
 */
function bindThinkingMode() {
    bindDetailCheckbox('openai_show_thoughts', 'leslie-model-thinking-mode', 'input');
    const mirror = document.getElementById('leslie-model-thinking-mode');
    const effort = document.getElementById('openai_reasoning_effort');
    if (!(mirror instanceof HTMLInputElement) || !(effort instanceof HTMLSelectElement) || !detailBindingController) {
        return;
    }
    mirror.addEventListener('change', () => {
        if (!mirror.checked && effort.value !== 'auto') {
            effort.value = 'auto';
            effort.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, { signal: detailBindingController.signal });
}

/**
 * Mirror an original numeric control to a slider and a number input.
 * @param {string} sourceId Existing numeric control id.
 * @param {string} mirrorId Leslie range id.
 */
function bindDetailRange(sourceId, mirrorId) {
    const source = document.getElementById(sourceId);
    const range = document.getElementById(mirrorId);
    const number = document.getElementById(`${mirrorId}-number`);
    if (!(source instanceof HTMLInputElement) || !(range instanceof HTMLInputElement) || !(number instanceof HTMLInputElement) || !detailBindingController) {
        return;
    }

    const syncFromSource = () => {
        ['min', 'max', 'step'].forEach((attribute) => {
            const value = source.getAttribute(attribute);
            if (value !== null) {
                range.setAttribute(attribute, value);
                number.setAttribute(attribute, value);
            }
        });
        range.value = source.value;
        number.value = source.value;
        range.disabled = source.disabled;
        number.disabled = source.disabled;
    };
    const syncToSource = (value) => {
        source.value = value;
        source.dispatchEvent(new Event('input', { bubbles: true }));
        syncFromSource();
    };
    range.addEventListener('input', () => syncToSource(range.value), { signal: detailBindingController.signal });
    number.addEventListener('input', () => syncToSource(number.value), { signal: detailBindingController.signal });
    source.addEventListener('input', syncFromSource, { signal: detailBindingController.signal });
    source.addEventListener('change', syncFromSource, { signal: detailBindingController.signal });
    observeDetailSource(source, syncFromSource, ['disabled', 'min', 'max', 'step']);
    syncFromSource();
}

/**
 * Update preset selection and feedback after reply values change.
 * @param {string} [message] Optional feedback message.
 */
function updateReplyPresetState(message) {
    const copy = COPY[getCopyLocale()];
    const activePreset = getActiveReplyStylePreset();
    settingsOverlay?.querySelectorAll('[data-leslie-reply-style]').forEach((button) => {
        const isActive = button.getAttribute('data-leslie-reply-style') === activePreset;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    const feedback = settingsOverlay?.querySelector('[data-leslie-preset-feedback]');
    if (feedback) {
        feedback.textContent = message
            || (activePreset ? `${copy.styleApplied}“${copy[REPLY_STYLE_PRESETS[activePreset].titleKey]}”${copy.styleAppliedTail}` : copy.styleCustom);
    }
    const undoButton = settingsOverlay?.querySelector('[data-leslie-preset-undo]');
    if (undoButton instanceof HTMLButtonElement) {
        undoButton.hidden = !lastReplyPresetSnapshot;
    }
}

/**
 * Assign a suggested reply value through the original SillyTavern handler.
 * @param {HTMLInputElement} source Original numeric control.
 * @param {number | string} value New value.
 */
function setReplyControlValue(source, value) {
    source.value = String(clampReplyPresetValue(source, Number(value)));
    source.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Apply one scene-based reply preset while preserving a one-step undo.
 * @param {string} presetId Reply preset id.
 */
function applyReplyStylePreset(presetId) {
    const preset = REPLY_STYLE_PRESETS[presetId];
    const ids = getReplyControlIds();
    const lengthSource = document.getElementById(ids.responseLength);
    const temperatureSource = document.getElementById(ids.temperature);
    if (!preset || !(lengthSource instanceof HTMLInputElement) || !(temperatureSource instanceof HTMLInputElement)) {
        return;
    }
    lastReplyPresetSnapshot = {
        lengthId: lengthSource.id,
        length: lengthSource.value,
        temperatureId: temperatureSource.id,
        temperature: temperatureSource.value,
    };
    setReplyControlValue(lengthSource, preset.length);
    setReplyControlValue(temperatureSource, preset.temperature);
    const copy = COPY[getCopyLocale()];
    updateReplyPresetState(`${copy.styleApplied}“${copy[preset.titleKey]}”${copy.styleAppliedTail}`);
}

/**
 * Restore the reply values captured before the most recently applied preset.
 */
function undoReplyStylePreset() {
    if (!lastReplyPresetSnapshot) {
        return;
    }
    const snapshot = lastReplyPresetSnapshot;
    const lengthSource = document.getElementById(snapshot.lengthId);
    const temperatureSource = document.getElementById(snapshot.temperatureId);
    lastReplyPresetSnapshot = undefined;
    if (lengthSource instanceof HTMLInputElement) {
        setReplyControlValue(lengthSource, snapshot.length);
    }
    if (temperatureSource instanceof HTMLInputElement) {
        setReplyControlValue(temperatureSource, snapshot.temperature);
    }
    updateReplyPresetState(COPY[getCopyLocale()].styleRestored);
}

/**
 * Keep a summary label synchronized with existing SillyTavern text.
 * @param {Element | null} source Existing text element.
 * @param {string} targetSelector Leslie summary selector.
 * @param {string} fallback Fallback label.
 */
function bindDetailText(source, targetSelector, fallback) {
    const target = settingsOverlay.querySelector(targetSelector);
    if (!source || !target) {
        return;
    }
    const update = () => {
        target.textContent = source.textContent?.trim() || fallback;
    };
    const observer = new MutationObserver(update);
    observer.observe(source, { childList: true, subtree: true, characterData: true });
    detailObservers.push(observer);
    update();
}

/**
 * Connect a rendered detail page to SillyTavern's original controls.
 * @param {string} detailId Detail page id.
 */
function bindDetailPage(detailId) {
    clearDetailBindings();
    detailBindingController = new AbortController();
    if (detailId === 'model') {
        const service = MODEL_SERVICES[getActiveModelService()];
        if (service?.kind === activeModelKind) {
            service.fields.forEach(([sourceId, mirrorId, , , kind]) => {
                if (kind === 'select') {
                    bindDetailSelect(sourceId, mirrorId);
                } else {
                    bindDetailInput(sourceId, mirrorId, 'input', { secret: kind === 'password' });
                }
            });
        }
        bindDetailCheckbox('auto-connect-checkbox', 'leslie-model-auto-connect', 'input');
        bindThinkingMode();
    } else if (detailId === 'reply') {
        const ids = getReplyControlIds();
        bindDetailSelect(ids.preset, 'leslie-reply-preset');
        bindDetailRange(ids.responseLength, 'leslie-reply-length');
        bindDetailRange(ids.contextSize, 'leslie-reply-context');
        bindDetailRange(ids.temperature, 'leslie-reply-creativity');
        bindDetailCheckbox(ids.streaming, 'leslie-reply-streaming', 'input');
        [document.getElementById(ids.responseLength), document.getElementById(ids.temperature)].forEach((source) => {
            source?.addEventListener('input', () => updateReplyPresetState(), { signal: detailBindingController.signal });
        });
        updateReplyPresetState();
    } else if (detailId === 'character') {
        const copy = COPY[getCopyLocale()];
        const characterName = document.querySelector('#rm_button_selected_ch h2') || document.getElementById('character_name_pole');
        bindDetailText(characterName, '[data-leslie-character-name]', copy.noCharacter);
    } else if (detailId === 'persona') {
        const copy = COPY[getCopyLocale()];
        bindDetailInput('persona_description', 'leslie-persona-description', 'input');
        bindDetailSelect('persona_description_position', 'leslie-persona-position', 'input');
        bindDetailCheckbox('persona_auto_lock', 'leslie-persona-lock', 'input');
        bindDetailText(document.getElementById('your_name'), '[data-leslie-persona-name]', copy.noPersona);
    } else if (detailId === 'world') {
        bindDetailSelect('world_info', 'leslie-world-info', 'change');
        bindDetailCheckbox('world_info_recursive', 'leslie-world-recursive', 'input');
    }
}

/**
 * Show one Leslie detail page without opening a raw SillyTavern drawer.
 * @param {string} detailId Detail page id.
 */
function showDetail(detailId) {
    const renderer = DETAIL_RENDERERS[detailId];
    const home = document.getElementById('leslie-settings-home');
    const detail = document.getElementById('leslie-settings-detail');
    const scroll = settingsOverlay.querySelector('.leslie-settings-scroll');
    if (!renderer || !home || !detail) {
        return;
    }
    if (detailId === 'model' && activeDetail !== 'model') {
        activeModelKind = MODEL_SERVICES[getActiveModelService()]?.kind || 'online';
    }
    activeDetail = detailId;
    updateSettingsNavigation(detailId);
    home.hidden = true;
    detail.innerHTML = renderer();
    detail.hidden = false;
    bindDetailPage(detailId);
    updateConnectionStatus();
    scroll?.scrollTo({ top: 0 });
    revealSettingsContent();
    requestAnimationFrame(() => {
        if (window.matchMedia('(max-width: 700px)').matches) {
            settingsOverlay.querySelector('[data-leslie-settings-nav-back]')?.focus();
        }
    });
}

/** Show the settings detail pane as a separate mobile page. */
function revealSettingsContent() {
    if (window.matchMedia('(max-width: 700px)').matches) {
        settingsOverlay?.classList.add('leslie-settings-mobile-detail');
    }
}

/** Return to the settings category list on narrow screens. */
function showSettingsNavigation() {
    settingsOverlay?.classList.remove('leslie-settings-mobile-detail');
    requestAnimationFrame(() => settingsOverlay?.querySelector('.leslie-settings-nav-item.active')?.focus());
}

/**
 * Keep the persistent category rail synchronized with the visible page.
 * @param {string} pageId Navigation page id.
 */
function updateSettingsNavigation(pageId) {
    let activeButton;
    settingsOverlay?.querySelectorAll('[data-leslie-settings-page]').forEach((button) => {
        const active = button.dataset.leslieSettingsPage === pageId;
        button.classList.toggle('active', active);
        if (active) {
            activeButton = button;
            button.setAttribute('aria-current', 'page');
        } else {
            button.removeAttribute('aria-current');
        }
    });
    const contentTitle = settingsOverlay?.querySelector('#leslie-settings-content-title');
    const activeTitle = activeButton?.querySelector('strong')?.textContent?.trim();
    if (contentTitle && activeTitle) {
        contentTitle.textContent = activeTitle;
    }
}

/**
 * Return from a detail page to the Leslie settings home.
 */
function showSettingsHome(pageId = 'overview') {
    const home = document.getElementById('leslie-settings-home');
    const detail = document.getElementById('leslie-settings-detail');
    const scroll = settingsOverlay?.querySelector('.leslie-settings-scroll');
    clearDetailBindings();
    activeDetail = undefined;
    updateSettingsNavigation(pageId);
    if (detail) {
        detail.hidden = true;
        detail.replaceChildren();
    }
    if (home) {
        home.hidden = false;
    }
    scroll?.scrollTo({ top: 0 });
}

/**
 * Switch SillyTavern to a common model service chosen by the user.
 * @param {string} serviceId Leslie service id.
 */
function selectModelService(serviceId) {
    const service = MODEL_SERVICES[serviceId];
    const mainApi = document.getElementById('main_api');
    if (!service || !(mainApi instanceof HTMLSelectElement)) {
        return;
    }
    activeModelKind = service.kind;
    mainApi.value = service.mainApi;
    mainApi.dispatchEvent(new Event('change', { bubbles: true }));
    window.setTimeout(() => {
        const secondary = document.getElementById(service.secondaryId);
        if (secondary instanceof HTMLSelectElement) {
            secondary.value = service.secondaryValue;
            secondary.dispatchEvent(new Event('change', { bubbles: true }));
        }
        showDetail('model');
    }, 60);
}

/**
 * Trigger the original connect action for the selected service.
 */
function connectSelectedModelService() {
    const service = MODEL_SERVICES[getActiveModelService()];
    document.getElementById(service?.connectId)?.click();
    const secretMirror = document.getElementById('leslie-model-key');
    if (secretMirror instanceof HTMLInputElement) {
        secretMirror.value = '';
    }
}

/**
 * Update every visible Leslie connection badge from SillyTavern's API icon.
 */
function updateConnectionStatus() {
    const connectionState = getLeslieConnectionState();
    const copy = COPY[getCopyLocale()];
    settingsOverlay?.querySelectorAll('[data-leslie-connection-status]').forEach((status) => {
        status.textContent = getConnectionStatusText(connectionState, copy);
        status.classList.toggle('is-checking', connectionState.checking);
        status.classList.toggle('is-connected', connectionState.connected);
        status.classList.toggle('is-configured', connectionState.configured && !connectionState.connected);
    });
    const modelStatus = settingsOverlay?.querySelector('[data-leslie-model-status]');
    if (modelStatus) {
        modelStatus.className = `leslie-model-status is-${connectionState.state}`;
        const text = modelStatus.querySelector('strong');
        if (text) {
            text.textContent = getConnectionStatusText(connectionState, copy);
        }
    }
}

/**
 * Reflect the real SillyTavern API connection icon in the simple settings row.
 */
function bindConnectionStatus() {
    const source = document.getElementById('API-status-top');
    if (source) {
        new MutationObserver(updateConnectionStatus).observe(source, { attributes: true, attributeFilter: ['class'] });
    }
    const apiSettings = document.getElementById('openai_api')?.parentElement;
    if (apiSettings) {
        new MutationObserver(updateConnectionStatus).observe(apiSettings, { attributes: true, attributeFilter: ['placeholder'], subtree: true });
    }
    document.querySelectorAll('.api_loading').forEach((loader) => {
        new MutationObserver(updateConnectionStatus).observe(loader, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    });
    [
        event_types.APP_READY,
        event_types.SETTINGS_LOADED_AFTER,
        event_types.ONLINE_STATUS_CHANGED,
        event_types.MAIN_API_CHANGED,
        event_types.CONNECTION_PROFILE_LOADED,
    ]
        .filter(Boolean)
        .forEach(eventName => eventSource.on(eventName, updateConnectionStatus));
    updateConnectionStatus();
}

/**
 * Keep keyboard focus inside the full-window settings page while it is visible.
 * @param {KeyboardEvent} event Keyboard event.
 */
function handleSettingsKeydown(event) {
    if (settingsOverlay.hidden) {
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        if (settingsOverlay.classList.contains('leslie-settings-mobile-detail')) {
            showSettingsNavigation();
        } else {
            closeSettings();
        }
        return;
    }
    if (event.key !== 'Tab') {
        return;
    }

    const focusable = Array.from(settingsOverlay.querySelectorAll('button:not([hidden]):not([disabled]), select:not([disabled]), input:not([disabled])'))
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
        return;
    }
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

/**
 * Add the hub after SillyTavern has created its standard page structure.
 */
function initLeslieSettings() {
    if (!document.body.classList.contains('leslie-modern') || document.getElementById('leslie-settings-launcher')) {
        return;
    }

    const copy = COPY[getCopyLocale()];
    const topSettings = document.getElementById('top-settings-holder');
    const characterDrawer = document.getElementById('rightNavHolder');
    if (!topSettings || !characterDrawer) {
        return;
    }

    SECONDARY_DRAWERS.forEach((id) => document.getElementById(id)?.classList.add('leslie-secondary-drawer'));

    settingsLauncher = document.createElement('button');
    settingsLauncher.id = 'leslie-settings-launcher';
    settingsLauncher.className = 'leslie-settings-launcher';
    settingsLauncher.type = 'button';
    settingsLauncher.title = copy.launcher;
    settingsLauncher.setAttribute('aria-label', copy.launcher);
    settingsLauncher.innerHTML = '<i class="fa-solid fa-gear" aria-hidden="true"></i><span></span>';
    settingsLauncher.querySelector('span').textContent = copy.launcher;
    topSettings.insertBefore(settingsLauncher, characterDrawer);

    settingsOverlay = createSettingsOverlay();
    document.body.append(settingsOverlay);
    lockAdvancedSettings();

    settingsLauncher.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSettings();
    });
    settingsOverlay.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-leslie-settings-home]')) {
            event.preventDefault();
            event.stopPropagation();
            showSettingsHome();
            revealSettingsContent();
            return;
        }
        if (target?.closest('[data-leslie-settings-anchor="advanced"]')) {
            event.preventDefault();
            event.stopPropagation();
            showSettingsHome('advanced');
            revealSettingsContent();
            requestAnimationFrame(() => document.getElementById('leslie-advanced-vault')?.scrollIntoView({ block: 'start' }));
            return;
        }
        if (target?.closest('[data-leslie-settings-nav-back]')) {
            event.preventDefault();
            event.stopPropagation();
            showSettingsNavigation();
            return;
        }
        const detailButton = target?.closest('[data-leslie-detail]');
        if (detailButton instanceof HTMLElement) {
            event.preventDefault();
            event.stopPropagation();
            showDetail(detailButton.dataset.leslieDetail);
            return;
        }
        if (target?.closest('[data-leslie-detail-back]')) {
            event.preventDefault();
            event.stopPropagation();
            const previousDetail = activeDetail;
            showSettingsHome();
            settingsOverlay.querySelector(`[data-leslie-detail="${previousDetail}"]`)?.focus();
            return;
        }
        const replyStyleButton = target?.closest('[data-leslie-reply-style]');
        if (replyStyleButton instanceof HTMLElement) {
            event.preventDefault();
            event.stopPropagation();
            applyReplyStylePreset(replyStyleButton.dataset.leslieReplyStyle);
            return;
        }
        if (target?.closest('[data-leslie-preset-undo]')) {
            event.preventDefault();
            event.stopPropagation();
            undoReplyStylePreset();
            return;
        }
        const apiKindButton = target?.closest('[data-leslie-api-kind]');
        if (apiKindButton instanceof HTMLElement) {
            event.preventDefault();
            event.stopPropagation();
            activeModelKind = apiKindButton.dataset.leslieApiKind;
            showDetail('model');
            return;
        }
        const serviceButton = target?.closest('[data-leslie-service]');
        if (serviceButton instanceof HTMLElement) {
            event.preventDefault();
            event.stopPropagation();
            selectModelService(serviceButton.dataset.leslieService);
            return;
        }
        if (target?.closest('[data-leslie-model-connect]')) {
            event.preventDefault();
            event.stopPropagation();
            connectSelectedModelService();
            return;
        }
        if (target?.closest('[data-leslie-open-character-list]')) {
            event.preventDefault();
            event.stopPropagation();
            openOriginalDrawer('rightNavHolder', 'rm_button_characters');
            return;
        }
        const sourceButton = target?.closest('[data-leslie-source-click]');
        if (sourceButton instanceof HTMLElement) {
            event.preventDefault();
            event.stopPropagation();
            clickOriginalControl(sourceButton.dataset.leslieSourceClick);
            return;
        }
        const drawerButton = target?.closest('[data-leslie-drawer-target]');
        if (drawerButton instanceof HTMLElement) {
            event.preventDefault();
            event.stopPropagation();
            openOriginalDrawer(drawerButton.dataset.leslieDrawerTarget);
            return;
        }
        if (target?.closest('[data-leslie-settings-close]')) {
            event.preventDefault();
            event.stopPropagation();
            closeSettings();
        }
    });
    document.getElementById('leslie-advanced-unlock')?.addEventListener('click', unlockAdvancedSettings);
    document.getElementById('leslie-advanced-relock')?.addEventListener('click', () => {
        lockAdvancedSettings();
        document.getElementById('leslie-advanced-unlock')?.focus();
    });
    document.addEventListener('keydown', handleSettingsKeydown);

    mirrorSelect('themes', 'leslie-theme-select');
    mirrorSelect('ui_language_select', 'leslie-language-select');
    mirrorCheckbox('reduced_motion', 'leslie-reduced-motion', 'input');
    mirrorCheckbox('fast_ui_mode', 'leslie-fast-ui', 'change');
    bindConnectionStatus();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLeslieSettings, { once: true });
} else {
    initLeslieSettings();
}
