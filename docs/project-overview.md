# Project overview

## Purpose

LeslieTavern explores a desktop-first character-chat experience while retaining SillyTavern's established chat engine and data compatibility. New behavior is implemented around the existing core wherever possible so users can continue using character cards and conversations without a forced migration.

## Architecture

```text
Electron shell
└─ SillyTavern server
   ├─ Existing chat, character, group, World Info, model, and JSONL flows
   ├─ Leslie identity service
   ├─ Leslie memory service
   ├─ Leslie moments service
   └─ Character voice proxy

Browser UI
├─ Existing SillyTavern interface and event system
├─ Leslie desktop chat and settings layers
├─ Memory and moments extensions
└─ Character workshop and voice settings
```

## Compatibility boundaries

- Existing SillyTavern chat events and storage formats remain authoritative.
- Leslie modules should be optional and fail open.
- Character cards, JSONL chats, group chats, World Info, swipes, and model adapters must remain usable.
- User data is local state and is not part of the source repository.
- Direct LAN web access may be enabled explicitly with an IP allowlist and a trusted-network firewall boundary. Device discovery, data synchronization, cloud synchronization, and automatic memory writes still require separate security and approval designs before implementation.

## Current maturity

The repository contains a runnable prototype with significant local verification. It is suitable for continued development and test distribution, but it is not yet a signed installer or a stable public release.

See [roadmap.md](roadmap.md) for planned work and [data-and-packaging.md](data-and-packaging.md) for repository boundaries.
