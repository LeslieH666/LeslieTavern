# Changelog

All notable LeslieTavern-specific changes are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project does not yet promise semantic-versioning compatibility.

## [Unreleased]

### Added

- Electron desktop workflow and Windows portable-package tooling.
- Leslie memory, identity isolation, moments, character workshop, and voice modules.
- Repository privacy guard, public documentation, community templates, and read-only CI.
- Disabled-by-default Leslie Bridge v1 foundation for AIRI, including bearer authentication, capability discovery, an OpenAPI draft, and OpenAI-compatible Volcengine speech synthesis.
- AIRI chat model gateway with streaming, cancellation, active LeslieTavern model discovery, and stored provider credentials.
- Authoritative AIRI companion turns that follow the active LeslieTavern character and use its normal card, World Info, Persona, memory, chat persistence, model, and Volcengine voice.
- Automatic AIRI voice input through LeslieTavern's local speech-recognition model, with no additional API key.
- Windows launch center for LeslieTavern-only and LeslieTavern + AIRI sessions, including automatic Bridge token generation, AIRI discovery, diagnostics, rebuild, logs, and tracked shutdown.
- Leslie chat-menu exports for a CCV3 PNG character card, the current SillyTavern JSONL chat, or a ZIP containing the shareable card and all of that character's JSONL chats.

### Changed

- Consolidated development and portable workspaces into one Git repository.
- Made allowlisted LAN access follow the directly connected private subnet so changing Wi-Fi no longer requires per-device IP entries.
- Integrated the complete AIRI source tree under `airi/`, removed its nested Git metadata, and made the LeslieTavern repository the single versioning and push boundary.
- Separated source-controlled files from local data, runtimes, caches, logs, and backups.
- Made the local Windows launcher verify the listener resolved from its actual configuration and report available LAN URLs when allowlisted LAN access is explicitly enabled.
- Simplified the dedicated AIRI frontend to auto-configure Leslie chat and speech, skip onboarding, hide provider and profile choices, and show only connection and display-model settings.
- Made the combined launcher rebuild AIRI automatically when its source is newer than the existing desktop build.
- Removed cross-window `DataCloneError` failures from automatic Leslie provider setup.
- Made character-avatar replacement preserve the existing character card and refresh character state, thumbnails, chat images, and editor previews without stale browser caches.
- Made AIRI Live2D startup fail open when local IndexedDB hydration stalls, restored the bundled Hiyori model when the companion selection is empty, kept the companion renderer active in the background, and stopped opening DevTools during ordinary local launches.
- Kept bundled Live2D loading independent of OPFS and moved custom-model cache persistence behind the visible model pipeline so a stalled browser storage backend cannot lock the stage and shortcut controls on “Loading”.
- Removed the unused eager DuckDB/WASM bootstrap from the character stage; the placeholder initialization consumed hundreds of megabytes and could monopolize the renderer before the Live2D frame became interactive.
- Made the Windows launcher accept only a complete, successfully stamped AIRI build so a failed partial rebuild cannot mix new main-process code with a stale renderer.

### Security

- Portable builds default to localhost-only networking and empty user data.
- Local LAN web access retains an explicit IP allowlist and is intended to be paired with a trusted-interface and subnet-scoped firewall rule.
- Private user artifacts and local planning notes are excluded from Git and distribution builds.
- Only successfully bearer-authenticated Leslie Bridge requests bypass CSRF protection; all other routes retain the existing login and CSRF boundary.
- Leslie Bridge model-gateway logs omit AIRI message and provider-response bodies.
- Local speech-recognition logs omit transcribed user text.
