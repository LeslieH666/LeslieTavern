# LeslieTavern

[English](README.en.md) | 简体中文

[![CI](https://github.com/LeslieH666/LeslieTavern/actions/workflows/ci.yml/badge.svg)](https://github.com/LeslieH666/LeslieTavern/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

LeslieTavern 是基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 开发的实验性桌面聊天分支。SillyTavern 的聊天、角色卡、群聊、World Info、Swipe、模型适配和 JSONL 存储仍是权威核心；Leslie 功能以可选扩展和服务形式叠加，普通聊天在这些功能不可用时仍应保持可用。

本仓库同时包含 `airi/` 桌面陪伴前端。LeslieTavern 与 AIRI 共享一个 Git 根目录和项目版本，由本仓库统一继续演化；两个应用保留各自的 npm/pnpm 依赖边界，通过默认关闭的 Leslie Bridge v1 对接。

> 当前处于可运行原型阶段，不是 SillyTavern 官方版本，也不是经过签名的正式发行版。

## 主要功能

- 保留 SillyTavern 的角色卡、群聊、World Info、Swipe、模型适配和 JSONL 聊天格式。
- 提供 Windows Electron 桌面入口、启动中心、诊断、联合启动和便携构建脚本。
- 提供 Leslie 身份、Persona / 剧情线隔离、记忆、朋友圈时间线和角色语音模块。
- 提供可选的互动引导输入：围绕当前用户 Persona 生成三个可点击回复，并回到原有聊天生成链路。
- 提供 AI 角色工坊：可使用当前聊天 API（包括 DeepSeek 等）或本地 OpenAI-compatible 模型生成 CCV3 草稿；结果只在内存中预览，用户明确应用后才进入角色编辑器。
- 提供 Peach 2.0 GGUF 的 KoboldCpp / llama.cpp 快捷配置。模型权重、推理程序和运行日志保持本地，不提交到 Git。
- 提供默认关闭、进程令牌保护的 Leslie Bridge v1，让 AIRI 复用当前角色、聊天、记忆、模型和火山语音。
- 将源码、运行时、用户数据和分发包明确分离，避免私人聊天进入 Git。

## 快速开始

### 开发环境

要求 Node.js 20 或更高版本、npm 和 Git。

```bash
git clone https://github.com/LeslieH666/LeslieTavern.git
cd LeslieTavern
npm ci
npm ci --prefix src/electron
npm run start
```

浏览器服务启动后默认使用本机地址。需要 Electron 桌面壳时运行：

```bash
npm run start:electron
```

如需运行完整仓库校验：

```bash
npm ci --prefix tests
npm run validate
```

`validate` 会依次执行仓库边界检查、LeslieTavern 源码 lint、测试目录 lint 和单元测试。端到端测试需要单独启动服务：

```bash
npm run test:e2e --prefix tests
```

如果要开发 AIRI，进入 `airi/` 后使用其 pnpm 工作区：

```bash
cd airi
pnpm install --frozen-lockfile
pnpm run dev
```

### 已整理的本机工作区

本项目提供以下 Windows 快捷入口：

- `启动中心.cmd`：选择只启动 LeslieTavern、联合启动 AIRI、停止或诊断。
- `启动 LeslieTavern.cmd`
- `启动 LeslieTavern 与 AIRI.cmd`
- `关闭 LeslieTavern.cmd`
- `关闭 LeslieTavern 与 AIRI.cmd`
- `备份用户数据.cmd`
- `打开用户数据目录.cmd`
- `查看运行日志.cmd`

这些脚本使用项目根目录下的本地 `data/`、`Runtime/` 和 `Config/`。这些目录不会进入 Git。
启用局域网监听后，与访问地址属于同一私有子网的设备无需逐个填写 IP；切换家庭 Wi-Fi 或手机热点后会自动使用新子网，公网及未用于当前连接的其他网段仍被拒绝。
联合启动、自动角色绑定和 AIRI 使用方法见 [LeslieTavern 与 AIRI 启动指南](docs/airi-launcher.md)。AIRI 不需要手动选择聊天 provider、模型或音色。

### 本地模型与角色工坊

本机工作区的默认模型是 Peach 2.0 GGUF，预期路径为：

```text
models/Peach-2.0-9B-8k-Roleplay/Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf
```

模型文件不会进入 Git；下载来源、8GB 显存建议和运行时说明见 [models/README.md](models/README.md)。推荐让 KoboldCpp 只监听 `127.0.0.1:5001`，或让 llama.cpp server 监听 `127.0.0.1:8080`。

使用流程：

1. 启动本地推理服务并加载 GGUF。
2. 在 LeslieTavern 的“设置 → 模型连接”中选择 KoboldCpp 或 llama.cpp，应用本地快捷配置并连接。
3. 打开“AI 角色工坊”，在“角色卡生成接口”中选择当前聊天 API 或本地 Peach。
4. 检查简报、知识核对、JSON 草稿和质量审校；预览不会自动写入角色目录。
5. 只有点击“带入角色编辑器”并在原有编辑流程中保存，才会创建正式角色卡。

本地模型是否遵循某条内容约束取决于模型权重、推理运行时和当前提示词；项目不把“无限制”作为稳定性或安全性保证。角色工坊的本地接口只负责本次草稿生成，不会替换全局聊天 API 设置。

## 项目结构

```text
LeslieTavern/
├─ .github/        GitHub Issue、PR 与 CI 配置
├─ airi/           集成的 AIRI 桌面前端源码与 pnpm 工作区
├─ docs/           架构、路线图、设计和数据说明
├─ packaging/      Windows 本机与便携版脚本
├─ public/         浏览器端界面与扩展
│  ├─ scripts/leslie-character-workshop/
│  ├─ scripts/leslie-story-choices.js
│  └─ scripts/leslie-local-model-core.js
├─ scripts/        仓库维护和数据迁移工具
├─ src/            服务端、Electron、Bridge 与 Leslie 模块
│  ├─ electron/    Electron 主进程和桌面入口
│  ├─ leslie-bridge/
│  ├─ leslie-identity/
│  ├─ leslie-memory/
│  ├─ leslie-moments/
│  └─ leslie-tts/
├─ tests/          单元测试与端到端测试
├─ models/         本地模型说明；权重文件不入 Git
├─ data/           本地用户数据，仅保留占位文件进入 Git
└─ README.md       项目入口
```

核心边界可以概括为：

```text
SillyTavern chat engine
├─ Leslie UI extensions
│  ├─ identity / memory / moments / voice
│  ├─ story choices
│  └─ character workshop providers
├─ Existing model adapters
└─ Optional Leslie Bridge v1
   └─ AIRI companion frontend
```

LeslieTavern 负责提示词组装、角色与聊天状态、记忆、模型和持久化；AIRI 负责显示模型、输入、回复展示、音频播放和口型同步。AIRI 不会建立第二套角色提示词，也不会自行选择模型或音色。完整边界见 [AIRI Bridge 说明](docs/airi-bridge.md)。

## 用户数据与隐私

角色卡、聊天、密钥、记忆、语音配置、日志、缓存、备份和本地运行时均被 `.gitignore` 排除。提交或报告问题前请运行：

```bash
npm run check:repo
```

不要在 Issue、Pull Request、日志或截图中附带聊天正文、角色文件、API 密钥或其他私人数据。详见 [数据与打包说明](docs/data-and-packaging.md) 和 [安全策略](SECURITY.md)。

## 文档

- [项目概览](docs/project-overview.md)
- [开发路线图](docs/roadmap.md)
- [界面设计基线](docs/design.md)
- [角色卡工作流](docs/character-card-workflow.md)
- [AIRI Bridge 说明](docs/airi-bridge.md)
- [LeslieTavern 与 AIRI 启动指南](docs/airi-launcher.md)
- [数据与打包说明](docs/data-and-packaging.md)
- [贡献指南](CONTRIBUTING.md)
- [变更记录](CHANGELOG.md)

## 上游与许可证

LeslieTavern 是 SillyTavern 的衍生项目，并非官方发行版。上游项目及原作者保留其各自权利；衍生代码继续采用 [GNU AGPL-3.0](LICENSE) 许可证。网络部署和修改版本分发同样需要遵守 AGPL-3.0。
