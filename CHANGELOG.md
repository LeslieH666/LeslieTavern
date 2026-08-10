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
- Made the local Windows launcher verify the listener resolved from its actual configuration and report available LAN URLs when allowlisted LAN access is explicitly enabled.

### Security

- Portable builds default to localhost-only networking and empty user data.
- Local LAN web access retains an explicit IP allowlist and is intended to be paired with a trusted-interface and subnet-scoped firewall rule.
- Private user artifacts and local planning notes are excluded from Git and distribution builds.
