# LeslieTavern local models

This directory is for locally downloaded model weights and is ignored by Git.

The configured starter model is:

`Peach-2.0-9B-8k-Roleplay/Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf`

Download source: <https://huggingface.co/QuantFactory/Peach-2.0-9B-8k-Roleplay-GGUF>

For an 8GB GPU, the project-provided Windows shortcut `启动本地模型.cmd` starts KoboldCpp with an 8K context, CUDA, and the local-only endpoint `http://127.0.0.1:5001`. Stop it with `关闭本地模型.cmd`.

The LeslieTavern model connection page can identify the running Peach service and apply its compatible provider, model, and generation defaults with one click. Peach is not a separate API provider.

If you configure a runtime manually, use either:

- KoboldCpp on `http://127.0.0.1:5001` (recommended)
- llama.cpp server on `http://127.0.0.1:8080`

The local KoboldCpp launcher, when installed by the project setup, lives at
`tools/koboldcpp/koboldcpp.exe` and is ignored by Git. It is downloaded from
the official [LostRuins/koboldcpp releases](https://github.com/LostRuins/koboldcpp/releases).

Keep inference services bound to `127.0.0.1` unless a deliberate, protected LAN setup is required.
