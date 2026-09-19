# Data and packaging

## Source-controlled files

The Git repository contains application source, tests, documentation, packaging scripts, and a placeholder at `data/.gitkeep`.

The following are always local and ignored:

- `data/`: characters, chats, groups, settings, secrets, memories, and user assets;
- `Runtime/` and `Config/`: bundled Electron runtime and local safe configuration;
- `Cache/`, `Run/`, and `logs/`: generated process state;
- `backups/`: local recovery archives, except its README;
- `notes/private/`: machine-specific planning and migration notes;
- `dist/`: generated portable packages.

## Local Windows workflow

The root Windows shortcuts call scripts under `packaging/windows-local/`. Paths are resolved relative to the repository, so the project can be moved without editing the scripts. `启动本地模型.cmd` and `关闭本地模型.cmd` manage only the tracked project KoboldCpp process and its child worker; an untracked process occupying port 5001 is never replaced. The launcher verifies the actual data root and the listener resolved from `Config/config.yaml` before reporting success. When LAN web access is enabled, `whitelistDirectPrivateNetworks` permits only clients that share the private subnet of the local address they connected to, so Wi-Fi changes do not require per-device entries and unrelated routed subnets are not implicitly trusted. The launcher reports resolvable hostname URLs before numeric addresses and writes them to `Run/LeslieTavern-lan-addresses.txt`, so DHCP address changes do not require a saved client URL to change when local DNS is available. Keep the Windows firewall restricted to a trusted local-subnet boundary; portable builds remain localhost-only.

`启动中心.cmd` runs the integrated `airi/` source tree from the same Git worktree. AIRI keeps its pnpm package boundary, while the root repository owns versioning and remotes for both applications. The launcher stores only ignored logs and process state. Bridge bearer tokens remain process-local and are never written to disk.

## Portable build

Build into a new or recognized package directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\packaging\windows-portable\build-portable.ps1 `
  -OutputPath .\dist\LeslieTavern
```

Use `-CleanExisting` only for an existing output containing the package marker created by the builder. The output includes source, production dependencies, Electron, safe configuration, helper scripts, a checksum manifest, and an empty `UserData/` directory.

## Before publishing

1. Run `npm run check:repo`.
2. Confirm `git status` contains no local data or secret files.
3. Build the portable package from a clean commit.
4. Confirm its manifest reports zero working-tree changes.
5. Scan the package for private filenames and content before sharing it.
