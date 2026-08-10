# Contributing to LeslieTavern

感谢你愿意参与 LeslieTavern。中文或英文均可用于 Issue、Pull Request 和文档；请保持描述清楚、改动可验证。

## 开始之前

1. 阅读 [项目概览](docs/project-overview.md)、[路线图](docs/roadmap.md)和 [AGENTS.md](AGENTS.md)。
2. 从仓库默认分支创建一个短生命周期分支。
3. 不要提交 `data/`、角色卡、聊天、密钥、日志、运行时、备份或构建产物。
4. 功能改动应尽量聚焦；不要在同一个 PR 中顺带重写无关模块。

## 开发环境

```bash
npm ci
npm ci --prefix src/electron
npm ci --prefix tests
```

常用命令：

```bash
npm run start:electron  # 启动 Electron 开发环境
npm run check:repo      # 检查仓库边界和私人文件
npm run lint            # ESLint
npm run test:unit       # 单元测试
```

## 兼容性原则

- 尽量通过外围模块和扩展实现功能，不破坏 SillyTavern 原有聊天事件和数据格式。
- 保持现有角色卡、JSONL 聊天、群聊、World Info、Swipe 和模型适配兼容。
- 记忆、身份、朋友圈和语音功能失败时应允许原聊天主流程继续运行。
- 修改数据格式时必须提供迁移、回滚和验证方案。
- 不要把特定用户、角色或本机绝对路径写进公开源码、测试夹具或文档。

## 提交和 Pull Request

建议使用清晰的约定式提交，例如：

```text
feat(memory): add scoped retrieval filter
fix(tts): cancel stale playback tasks
docs: clarify portable data boundaries
```

Pull Request 应说明：

- 为什么需要修改；
- 实际修改了什么；
- 如何验证；
- 是否涉及用户数据格式、网络监听、凭证或上游兼容性；
- 必要时附上已经脱敏的截图或日志。

## AI 辅助开发

允许使用 AI 编码工具，但提交者仍需理解、审查并测试全部改动。请避免大范围无关格式化、虚构测试结果、泄露提示词中的私人数据，或在没有来源时把模型输出当作事实。

## 许可证

提交到本项目的贡献将按 [GNU AGPL-3.0](LICENSE) 发布。请仅提交你有权授权的代码、素材和文档。
