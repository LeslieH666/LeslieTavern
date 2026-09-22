# Roadmap

## Available in the current prototype

- SillyTavern-compatible chat and character workflows.
- Electron desktop entry point and a listener-aware local launcher; the current workspace can explicitly enable same-subnet LAN web access without per-device whitelist entries.
- Modern desktop chat layout and settings adaptations.
- A runtime-selectable Cupertino design language for the conversation list, chat chrome, message bubbles, and composer, with purposeful reduced-motion-aware transitions and a persisted classic-theme fallback that leaves the original DOM and chat behavior intact.
- A one-click demo mode in Leslie settings that switches the current browser session to an isolated per-account storage namespace for synthetic feature showcases and screenshots, without copying regular chats, character cards, memories, or API secrets.
- Semantic reply modes that guide balanced, novel, dialogue-driven, or concise presentation through prompt injection instead of fixed per-style token caps; DeepSeek foreground replies can use provider-controlled output length.
- First versions of Leslie memory and Persona/storyline identity isolation.
- Separate story and reality chat lines backed by ordinary SillyTavern JSONL chats. Reality chats use a one-time core-personality extraction instead of the full character card, reopen the latest matching JSONL instead of creating a replacement, generate one non-fixed greeting on each entry through the active API, enforce plain instant-message output, follow device time and elapsed offline time, and keep same-character cross-line recall capped at two memory resonances rather than current-world facts. Older reality metadata is upgraded in place without discarding chat history.
- Moments publishing and timeline storage, plus model-backed per-post/per-character unique read receipts, persisted low/medium/high enthusiasm controls, and selective likes/comments that continue while the Electron app is hidden in the system tray.
- Threaded Moments replies with repeated AI participation, publishing-Persona ownership for every user reply, Persona likes/unlikes separated from the clickable liker list, per-character comment/reply permission that leaves AI likes unrestricted, reversible delete/restore permission shared by local users, and lossless migration of legacy timelines and activity sidecars.
- Text-only character-authored Moments with explicit per-character enablement and frequency controls for both recently chatted and library-only characters.
- Parallel per-character Moments memory with Persona/story isolation, cross-post retrieval, a content-role picker independent from audience visibility, complete discovery of confirmed and legacy memory sources, read-only access to that role's approved chat memory, A–B–C/newest-first user-selected memory-topic import, and a future chat prompt adapter that remains disabled.
- A Cupertino-aligned Moments pass covering a desktop two-pane role/timeline layout, grouped content-role and audience controls, 44px primary targets, adapted reply/thread controls and secondary dialogs, selected-first role lists, reduced-motion handling, and a mobile single-column fallback.
- Volcengine character voice settings and playback integration.
- Character workshop prototype.
- Character-card and chat-record export from the Leslie chat menu, including a combined ZIP that preserves CCV3 PNG and SillyTavern JSONL files.
- Windows portable-package builder with empty distributable user data.
- Disabled-by-default Leslie Bridge v1 foundation with bearer authentication, capability discovery, and an OpenAI-compatible Volcengine speech route.
- Authoritative AIRI companion turns through the active LeslieTavern character, chat, prompt pipeline, memory, and model.
- Automatic AIRI binding to the visible LeslieTavern character and its Volcengine voice.
- Dedicated AIRI mode with automatic provider selection, no onboarding window, and a reduced settings surface.
- One `Leslie Heaven` desktop launcher, with AIRI and Peach local-model start/stop actions moved into Electron-only model settings and backed by tracked-process shutdown.
- Optional interactive-guidance input mode with three AI-generated replies anchored to the current user Persona, automatic collapse for free-form typing, and the existing model, character-card, World Info, Persona, memory, and chat pipeline as its source of truth.
- One-click local Peach 2.0 GGUF detection and API configuration through the existing KoboldCpp or llama.cpp adapters, plus desktop settings start/stop controls; model weights remain outside Git.
- Character workshop provider switch between the existing chat API and local Peach generation, with structured-output budgeting and preview-only drafts.
- Per-memory model selection for automatic memory extraction and growth synthesis, including the existing chat API, the DeepSeek OpenAI Chat Completions API, local OpenAI-compatible runtimes, and independent OpenAI-compatible endpoints.
- Project-wide local-model loading gate shared by chat, character workshop, and memory-model adapters; disabling it leaves local model files intact while preventing local calls.
- Model connection checks retain the selected provider and visible endpoint across settings refreshes, recover the button after failures, and keep autosave/backup maintenance from taking down the service.
- Bundled Peach roleplay output now stops at its known bracketed state/scene continuation pattern before contaminated text can be saved into chat history.
- One-click standard Character Card V2/V3 JSON import in the manual character editor, with an optional avatar upload synchronized to the native create form before saving.

## Stabilization priorities

1. Expand regression coverage for ordinary chat with every Leslie module disabled.
2. Add long-response cancellation and swipe coverage for automatic voice playback.
3. Split the largest frontend modules into smaller maintainable units.
4. Add schema migration and recovery fixtures for identity, memory, and moments stores.
5. Add AIRI controls for LeslieTavern retry, regenerate, swipe, edit, and branch operations.
6. Add an optional per-character AIRI display-model mapping without mixing it into LeslieTavern character data.
7. Extend reality-line switching to group chats after group identity, membership, and cross-line privacy rules are specified and tested.

## Later work

- Optional injection of selected Moments memory into ordinary character chat after prompt-budget, privacy, and regression review.
- A project/workspace layer for multiple stories or role-play contexts.
- Secure LAN device discovery and synchronization with authentication and a documented threat model.
- Signed installer, update strategy, version migration, and release automation.

## Not promised yet

There is no stable release schedule, public synchronization service, compatibility guarantee for unreleased schemas, or automatic publishing pipeline.
