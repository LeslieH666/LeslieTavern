# Security Policy

## Supported versions

LeslieTavern is currently a prototype. Security fixes are applied to the latest default branch; older snapshots and unofficial portable packages are not guaranteed to receive updates.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature under **Security → Report a vulnerability**. If private reporting is unavailable, contact the repository owner privately before publishing technical details.

Do not open a public Issue for vulnerabilities involving authentication bypass, remote code execution, secret exposure, unsafe network listening, or private user data.

Please include:

- the affected commit or version;
- the operating mode (Node.js, Electron, or portable package);
- reproduction steps and expected impact;
- a minimal proof of concept with all credentials and user content removed.

## Privacy-sensitive reports

Never attach real chat JSONL files, character cards, `secrets.json`, API keys, cookies, memory stores, full settings files, or unsanitized logs. Replace private content with a minimal synthetic fixture.

## Security boundaries

- The provided desktop configuration is intended to listen on localhost only.
- Local `data/`, `Config/`, `Runtime/`, logs, caches, and backups are not source-controlled.
- Enabling LAN or public access requires a separate authentication and threat-model review.
- Dependency vulnerabilities should also be reported to the relevant upstream maintainer when appropriate.
