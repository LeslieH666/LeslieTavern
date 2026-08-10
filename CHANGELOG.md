# Changelog

All notable LeslieTavern-specific changes are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project does not yet promise semantic-versioning compatibility.

## [Unreleased]

### Added

- Electron desktop workflow and Windows portable-package tooling.
- Leslie memory, identity isolation, moments, character workshop, and voice modules.
- Repository privacy guard, public documentation, community templates, and read-only CI.

### Changed

- Consolidated development and portable workspaces into one Git repository.
- Separated source-controlled files from local data, runtimes, caches, logs, and backups.

### Security

- Portable builds default to localhost-only networking and empty user data.
- Private user artifacts and local planning notes are excluded from Git and distribution builds.
