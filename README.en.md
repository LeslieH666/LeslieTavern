# LeslieTavern

English | [简体中文](README.md)

[![CI](https://github.com/LeslieH666/LeslieTavern/actions/workflows/ci.yml/badge.svg)](https://github.com/LeslieH666/LeslieTavern/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

LeslieTavern is an experimental desktop-oriented fork of [SillyTavern](https://github.com/SillyTavern/SillyTavern). It preserves the upstream chat and data formats while adding an Electron entry point, a modern chat interface, character memory, identity isolation, a moments prototype, and character voice features.

> The project is a runnable prototype. It is not an official SillyTavern release or a signed production distribution.

## Highlights

- Compatible with SillyTavern character cards, group chats, World Info, swipes, model adapters, and JSONL chats.
- Windows Electron workflow with one `Leslie Heaven` entry point, in-app AIRI/local-model controls, and portable-package tooling.
- Leslie memory and Persona/storyline isolation with story/reality chat lines that share only bounded memory resonance. Reality chats extract a de-fictionalized core personality, generate dynamic openings through the active API, and persist strictly plain instant messages; Moments provides a desktop-first timeline.
- Volcengine voice configuration, preview, and automatic reply playback.
- Explicit separation between source code, local user data, runtimes, backups, and distributable builds.

## Development setup

Node.js 20 or newer, npm, and Git are required.

```bash
git clone https://github.com/LeslieH666/LeslieTavern.git
cd LeslieTavern
npm ci
npm ci --prefix src/electron
npm run start:electron
```

Run the repository checks with:

```bash
npm ci --prefix tests
npm run check:repo
npm run lint
npm run test:unit
```

## Repository layout

```text
LeslieTavern/
├─ .github/        Issue, pull request, and CI configuration
├─ docs/           Architecture, roadmap, design, and data guidance
├─ packaging/      Local Windows and portable-package scripts
├─ public/         Browser UI and extensions
├─ scripts/        Repository maintenance and migration tools
├─ src/            Server, Electron, and Leslie modules
├─ tests/          Unit and end-to-end tests
└─ data/           Local user data; only a placeholder is tracked
```

## Privacy

Character cards, chats, secrets, memories, voice settings, logs, caches, backups, and local runtimes must not be committed. Run `npm run check:repo` before publishing changes. Never attach private chats, character files, credentials, or unsanitized logs to issues or pull requests.

See [Data and packaging](docs/data-and-packaging.md), [Contributing](CONTRIBUTING.md), and the [Security policy](SECURITY.md).

## Upstream and license

LeslieTavern is an unofficial derivative of SillyTavern. Copyright remains with the respective authors, and derivative source is distributed under the [GNU AGPL-3.0](LICENSE).
