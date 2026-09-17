# Roadmap

## Available in the current prototype

- SillyTavern-compatible chat and character workflows.
- Electron desktop entry point and a listener-aware local launcher; the current workspace can explicitly enable same-subnet LAN web access without per-device whitelist entries.
- Modern desktop chat layout and settings adaptations.
- Semantic reply modes that guide balanced, novel, dialogue-driven, or concise presentation through prompt injection instead of fixed per-style token caps; DeepSeek foreground replies can use provider-controlled output length.
- First versions of Leslie memory and Persona/storyline identity isolation.
- Moments publishing and timeline storage, plus model-backed read receipts and selective likes/comments that continue while the Electron app is hidden in the system tray.
- Volcengine character voice settings and playback integration.
- Character workshop prototype.
- Character-card and chat-record export from the Leslie chat menu, including a combined ZIP that preserves CCV3 PNG and SillyTavern JSONL files.
- Windows portable-package builder with empty distributable user data.
- Disabled-by-default Leslie Bridge v1 foundation with bearer authentication, capability discovery, and an OpenAI-compatible Volcengine speech route.
- Authoritative AIRI companion turns through the active LeslieTavern character, chat, prompt pipeline, memory, and model.
- Automatic AIRI binding to the visible LeslieTavern character and its Volcengine voice.
- Dedicated AIRI mode with automatic provider selection, no onboarding window, and a reduced settings surface.
- Windows launch center with LeslieTavern-only, combined AIRI, diagnostics, rebuild, and tracked shutdown modes.
- Optional interactive-guidance input mode with three AI-generated replies anchored to the current user Persona, automatic collapse for free-form typing, and the existing model, character-card, World Info, Persona, memory, and chat pipeline as its source of truth.
- One-click local Peach 2.0 GGUF API setup for KoboldCpp or llama.cpp, with the model weights kept outside Git.
- Character workshop provider switch between the existing chat API and local Peach generation, with structured-output budgeting and preview-only drafts.

## Stabilization priorities

1. Expand regression coverage for ordinary chat with every Leslie module disabled.
2. Add long-response cancellation and swipe coverage for automatic voice playback.
3. Split the largest frontend modules into smaller maintainable units.
4. Add schema migration and recovery fixtures for identity, memory, and moments stores.
5. Add AIRI controls for LeslieTavern retry, regenerate, swipe, edit, and branch operations.
6. Add an optional per-character AIRI display-model mapping without mixing it into LeslieTavern character data.

## Later work

- Optional character-authored Moments posts, with separate frequency, review, and story-consistency controls.
- A project/workspace layer for multiple stories or role-play contexts.
- Secure LAN device discovery and synchronization with authentication and a documented threat model.
- Signed installer, update strategy, version migration, and release automation.

## Not promised yet

There is no stable release schedule, public synchronization service, compatibility guarantee for unreleased schemas, or automatic publishing pipeline.
