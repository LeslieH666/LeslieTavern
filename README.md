# SillyTavern Leslie

这是基于 SillyTavern `release` 分支开发的本地优先桌面聊天项目。当前保留原有聊天、角色卡、World Info、群聊、Swipe、模型适配和 JSONL 数据格式，并在外围加入 Electron 桌面外壳、Leslie 现代界面和角色/群聊记忆。

当前版本属于可运行原型，不是正式发布版。开始开发或修改启动方式前，请依次阅读：

1. [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md)：长期目标、技术原则和固定数据路径；
2. [`PROJECT_STATUS.md`](PROJECT_STATUS.md)：当前完成度、测试结果、风险和推荐下一步；
3. [`design.md`](design.md)：现代聊天界面的设计基线。

## 本机启动与数据

- 唯一项目根目录：`D:\Projects\sillytavern-leslie`
- 唯一正式数据根目录：`D:\Projects\sillytavern-leslie\data`
- 日常聊天：双击根目录的 `启动 LeslieTavern.cmd`
- 开发启动命令：`npm run start:electron`
- 统一目录、备份和分发说明：[`UNIFIED_WORKSPACE.md`](UNIFIED_WORKSPACE.md)

不得把其他 SillyTavern 全局目录当作正式数据。完整路径规则见 `PROJECT_BRIEF.md` 第 10 节。

## 上游资源

- GitHub：<https://github.com/SillyTavern/SillyTavern>
- 文档：<https://docs.sillytavern.app/>

## License

AGPL-3.0
