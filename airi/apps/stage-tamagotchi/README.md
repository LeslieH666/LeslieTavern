# AIRI Desktop

This app is the Electron edition of AIRI. It owns desktop windows, local services, and secure process boundaries.

## Development

Run these commands from the repository root.

```shell
pnpm dev:tamagotchi
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm -F @proj-airi/stage-tamagotchi exec vitest run
```

## Leslie Tavern companion bridge

The Leslie Tavern provider connects AIRI Desktop to a local Leslie Bridge. The Electron main process owns the bearer token.

The renderer can request status, models, voices, speech, and chat streams through Eventa. The renderer cannot read the bearer token.

Set these environment variables before AIRI starts:

| Variable | Requirement |
| --- | --- |
| `LESLIE_BRIDGE_TOKEN` | Required. Use the same 32-byte or longer value for Leslie Tavern. |
| `LESLIE_BRIDGE_BASE_URL` | Optional. The default is `http://127.0.0.1:8000/api/leslie/bridge/v1/`. |

The client accepts loopback hosts only. It rejects URLs with credentials, queries, fragments, or a different API path.

Version 1 connects to an existing Leslie Tavern process. AIRI does not start or stop that process.

Do not put `LESLIE_BRIDGE_TOKEN` in renderer storage, a query string, or source control.

## Leslie Tavern chat model gateway

Select a Chat Completions provider and model in Leslie Tavern first. Then add the Leslie Tavern Chat provider in AIRI.

The gateway uses the Leslie Tavern provider connection and stored API key. AIRI owns the prompt and chat history in this mode.

The gateway streams OpenAI-compatible response data through the Electron main process. AIRI sends cancellation when a chat stream stops.

This mode does not load LeslieTavern character cards, Persona, World Info, prompt extensions, or Leslie memory.

## When not to use the bridge

Do not use the provider for remote Leslie Tavern servers. The current security contract supports one local desktop companion process.
