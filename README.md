# LeslieTavern

[English](README.en.md) | 简体中文

[![CI](https://github.com/LeslieH666/LeslieTavern/actions/workflows/ci.yml/badge.svg)](https://github.com/LeslieH666/LeslieTavern/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

LeslieTavern 是基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 开发的实验性桌面聊天分支，保留原有聊天兼容性，并增加 Electron 桌面入口、现代聊天界面、角色记忆、身份隔离、朋友圈原型和角色语音功能。

> 当前处于可运行原型阶段，不是 SillyTavern 官方版本，也不是经过签名的正式发行版。

## 主要功能

- 保留 SillyTavern 的角色卡、群聊、World Info、Swipe、模型适配和 JSONL 聊天格式。
- 提供 Windows Electron 桌面运行方式和可携带构建脚本。
- 提供 Leslie 记忆、Persona / 剧情线身份隔离与朋友圈时间线原型。
- 提供火山引擎角色语音配置、试听与回复自动朗读。
- 将源码、运行时、用户数据和分发包明确分离，避免私人聊天进入 Git。

## 快速开始

### 开发环境

要求 Node.js 20 或更高版本、npm 和 Git。

```bash
git clone https://github.com/LeslieH666/LeslieTavern.git
cd LeslieTavern
npm ci
npm ci --prefix src/electron
npm run start:electron
```

如需运行测试：

```bash
npm ci --prefix tests
npm run check:repo
npm run lint
npm run test:unit
```

### 已整理的本机工作区

本项目提供以下 Windows 快捷入口：

- `启动 LeslieTavern.cmd`
- `关闭 LeslieTavern.cmd`
- `备份用户数据.cmd`
- `打开用户数据目录.cmd`
- `查看运行日志.cmd`

这些脚本使用项目根目录下的本地 `data/`、`Runtime/` 和 `Config/`。这些目录不会进入 Git。

## 项目结构

```text
LeslieTavern/
├─ .github/        GitHub Issue、PR 与 CI 配置
├─ docs/           架构、路线图、设计和数据说明
├─ packaging/      Windows 本机与便携版脚本
├─ public/         浏览器端界面与扩展
├─ scripts/        仓库维护和数据迁移工具
├─ src/            服务端、Electron 与 Leslie 模块
├─ tests/          单元测试与端到端测试
├─ data/           本地用户数据，仅保留占位文件进入 Git
└─ README.md       项目入口
```

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
- [数据与打包说明](docs/data-and-packaging.md)
- [贡献指南](CONTRIBUTING.md)
- [变更记录](CHANGELOG.md)

## 上游与许可证

LeslieTavern 是 SillyTavern 的衍生项目，并非官方发行版。上游项目及原作者保留其各自权利；衍生代码继续采用 [GNU AGPL-3.0](LICENSE) 许可证。网络部署和修改版本分发同样需要遵守 AGPL-3.0。
