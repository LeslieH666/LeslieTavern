# LeslieTavern local models

This is the single folder for locally downloaded model weights and is ignored by Git. Put a single-file `.gguf` in this folder or a subfolder. In Leslie Heaven desktop, open Settings → Model connection → Local API, select a discovered model in the KoboldCpp card, and click Connect selected model. The app starts or switches the tracked local runtime and configures the existing chat adapter. No port entry is needed for this flow.

The two project model locations are:

`Qwen3.5-text-9B-NSFW-RP-RolePlay/Qwen3.5-text-9B-NSFW-RP-RolePlay.Q4_K_M.gguf`

`Peach-2.0-9B-8k-Roleplay/Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf`

Qwen download source: <https://huggingface.co/mradermacher/Qwen3.5-text-9B-NSFW-RP-RolePlay-GGUF>

The Q4_K_M file is 5,629,108,224 bytes; SHA-256: `66e4b2cbaa6adda9f2f8f5de9747c798df1860905c989cf1e2401892870e987b`.

Peach download source: <https://huggingface.co/QuantFactory/Peach-2.0-9B-8k-Roleplay-GGUF/blob/main/Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf>. The Q4_K_M file is 5,328,958,208 bytes; SHA-256: `cbecccf05784fe1e337fd84a0a0bc56590ffe7089f41665279bd13e7e9d8c478`.

For an 8GB GPU, the Electron-only local service control starts KoboldCpp with an 8K context, CUDA, and the local-only endpoint `http://127.0.0.1:5001`.

The local Windows runtime is KoboldCpp v1.121 from <https://github.com/LostRuins/koboldcpp/releases/tag/v1.121>; its `koboldcpp.exe` SHA-256 is `90b0d74ec01e5ef72efb6d45e6f10bee649458920ec951f48d58794c366b1639`. The executable stays under ignored `tools/koboldcpp/`.

The model connection page scans valid single-file GGUF headers and lists both models under the managed KoboldCpp connection method. A listed file is a load candidate; KoboldCpp still checks its architecture and available memory when starting. Split GGUF parts and multimodal projector files are excluded from one-click use. Neither model is a separate API provider.

KoboldCpp exposes the loopback OpenAI-compatible API at `http://127.0.0.1:5001`: `GET /v1/models` for detection and `POST /v1/chat/completions` for character-workshop generation. Ordinary chats continue through LeslieTavern's existing KoboldCpp adapter after one-click configuration.

For Ollama, llama.cpp, other model formats, or a separately started runtime, expand Advanced connection settings. If you configure a runtime manually, use either:

- KoboldCpp on `http://127.0.0.1:5001` (recommended)
- llama.cpp server on `http://127.0.0.1:8080`

The local KoboldCpp launcher, when installed by the project setup, lives at
`tools/koboldcpp/koboldcpp.exe` and is ignored by Git. It is downloaded from
the official [LostRuins/koboldcpp releases](https://github.com/LostRuins/koboldcpp/releases).

Keep inference services bound to `127.0.0.1` unless a deliberate, protected LAN setup is required.
