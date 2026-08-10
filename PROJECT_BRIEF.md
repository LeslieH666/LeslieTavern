# SillyTavern Leslie 项目说明

> 本文件是项目的长期背景与需求基线。开始开发、设计或架构调整前，应先阅读本文件。

## 1. 项目目标

本项目计划以开源项目 [SillyTavern/SillyTavern](https://github.com/SillyTavern/SillyTavern) 为基础，开发一款：

- 使用 Electron 打包的跨平台桌面软件；
- 面向 LLM 角色扮演用户；
- 默认界面简单、容易理解；
- 保留 SillyTavern 已经成熟的聊天和提示词能力；
- 支持同一账号的多台设备在局域网内同步聊天记录和项目文件；
- 本地优先，不依赖云服务器即可完成主要功能。

项目的核心定位是：

> 保留 SillyTavern 已经成熟的聊天内核，用 Electron 将它变成完整桌面软件；通过简单模式降低使用难度，再在外围加入项目管理和安全的局域网同步。

## 2. 用户背景与沟通要求

项目所有者目前不具备软件开发方面的专业知识。因此，在进行技术决策或重要修改前，需要先使用普通语言说明。

说明重要改动时，应依次回答：

1. 现在是什么情况；
2. 准备修改什么；
3. 为什么需要修改；
4. 会影响哪些功能或数据；
5. 有什么风险；
6. 是否能够撤回以及如何恢复；
7. 推荐采用什么方案。

第一次使用专业术语时，应立即解释其含义。例如：

> JSONL 是一种文本文件格式，每一行保存一条独立的 JSON 数据；SillyTavern 使用它保存聊天记录。

会影响整体架构、数据格式、用户数据或 SillyTavern 兼容性的选择，必须先说明并等待项目所有者确认。普通且容易撤销的代码整理，可以在说明后执行并验证。

## 3. 已确认的技术原则

### 3.1 不重写 SillyTavern 聊天核心

以下原有能力原则上直接保留：

- 消息发送、流式生成和停止生成；
- 编辑、删除、重新生成和 Swipe；
- 续写、群聊和聊天分支；
- 角色卡、Persona 和 World Info；
- Prompt Manager 和提示词编排；
- token 预算与历史消息裁剪；
- 模型供应商适配；
- JSONL 聊天存储；
- 扩展事件和生成拦截机制。

除非有明确、经过解释和确认的理由，不应替换原有聊天生成路线，不应从零重写提示词系统，也不应擅自改变角色扮演效果。

### 3.2 简化界面，而不是删除底层能力

项目计划提供两种使用方式：

- **简单模式**：默认模式，只显示普通用户需要理解的内容；
- **高级模式**：保留原有或重新整理后的 SillyTavern 高级配置。

简单模式中的提示词配置优先呈现为：

- 角色是谁；
- 玩家是谁；
- 当前世界和场景；
- 模型应该怎样回复；
- 当前对话发生了什么。

Prompt Manager、复杂 World Info、供应商高级参数等能力不应被直接删除，而应默认隐藏或放入高级模式。

### 3.3 Electron 是桌面外壳

目标结构是：

```text
Electron 桌面外壳
    ↓
简单模式界面及桌面功能
    ↓
原有 SillyTavern 聊天系统
```

Electron 主要负责：

- 启动和关闭本地 SillyTavern 服务；
- 创建桌面窗口；
- 管理应用数据目录；
- Windows、macOS 和 Linux 打包；
- 文件选择、通知、系统托盘等桌面能力；
- 局域网设备发现和同步；
- 操作系统安全凭据存储；
- 后续的自动更新。

Electron 不负责替换提示词编排和角色回复生成。

### 3.4 同步系统与聊天系统分离

局域网同步原则上只同步已经保存的数据，不参与模型如何生成回复。

```text
聊天系统生成并保存数据
          ↓
同步系统发现数据发生变化
          ↓
将变化安全发送到已配对设备
          ↓
接收设备校验、保存并刷新相关内容
```

SillyTavern 保存聊天时可能重写整个 JSONL 文件。如果多台设备同时编辑同一聊天，简单复制文件可能造成相互覆盖。因此，同步功能需要额外处理：

- 文件版本检测；
- 稳定的同步标识；
- 离线变更队列；
- 删除标记；
- 冲突检测；
- 冲突副本或版本选择；
- 完整性校验；
- 同步后安全刷新。

这些改动应限制在保存边界和同步层，避免改变生成逻辑。

### 3.5 Leslie 角色成长与分级记忆

Leslie 将在 SillyTavern 原有角色卡和聊天系统之外增加一套可关闭的角色成长与记忆模块。该模块遵循以下原则：

- SillyTavern 原始角色卡是角色核心人格的唯一来源，不由 AI 自动覆盖；
- 角色成长状态与具体事件记忆分开保存，并按单条聊天及其分支隔离；
- 事件记忆分为 A（塑造性经历）、B（阶段性记忆）和 C（日常记忆）三类；
- “遗忘”只表示记忆不再主动进入提示词，不表示永久删除原始记录；
- A 类事件引起的人格变化在第一版中必须经过用户确认；
- 生成回复时，只通过 SillyTavern 扩展接口临时加入已批准的成长状态和当前相关记忆；
- 关闭该模块后，聊天必须恢复为 SillyTavern 原有生成行为；
- 记忆数据使用 Leslie 独立目录、格式版本、原子写入和历史快照，不修改角色卡正文；
- 聊天元数据只保存 Leslie 命名空间下的稳定记忆标识，且必须提供清理和恢复方式；
- 单角色与群聊复用同一套记忆存储、审核、衰减、分支和提示词注入流程；群聊按“群组 ID + 会话 ID”隔离共享档案，并保留每条消息的真实发言者和记忆参与者，禁止把一个成员的经历或成长套用给其他成员。

目标结构是：

```text
SillyTavern 原始角色卡（核心人格）
          +
Leslie 当前成长状态（按聊天分支）
          +
Leslie 当前相关记忆（A/B/C 分级与衰减）
          ↓
SillyTavern 原有提示词和模型生成流程
```

第一版不得让记忆分析阻塞或替换正常回复。分析失败时应保留上一版有效状态并继续原有生成流程。

## 4. 产品目标清单

### 4.1 Electron 跨平台应用

- [ ] Windows、macOS 和 Linux 桌面应用；
- [ ] 安装后即可运行，不要求用户手动安装 Node.js；
- [ ] 使用操作系统标准数据目录；
- [ ] 支持单实例、安全退出和异常恢复；
- [ ] 提供安装包，后续可增加便携版；
- [ ] 后续支持自动更新。

首批建议支持：

- Windows x64；
- macOS Apple Silicon；
- Linux x64。

### 4.2 项目系统

将分散的角色扮演内容整理成容易理解的“项目”。一个项目可以包含：

- [ ] 项目名称、封面和简介；
- [ ] 角色卡；
- [ ] Persona；
- [ ] 聊天会话；
- [ ] 世界设定或知识库；
- [ ] 图片、音频和其他附件；
- [ ] 模型连接与生成预设；
- [ ] 项目级提示词；
- [ ] 项目导入、导出和备份；
- [ ] 是否参与局域网同步的设置。

项目系统应尽量使用外围索引和映射，不应立即破坏 SillyTavern 的原始文件格式。

### 4.3 账号与设备

第一阶段采用本地账号，不要求云端注册：

- [ ] 本地账号和密码；
- [ ] 稳定的账号身份；
- [ ] 每台设备拥有独立身份和密钥；
- [ ] 通过二维码或一次性配对码添加设备；
- [ ] 查看和撤销已配对设备；
- [ ] 为不同项目设置同步范围；
- [ ] API 密钥默认只保存在当前设备。

### 4.4 局域网同步

- [ ] 自动发现局域网内的设备；
- [ ] 自动发现失败时可以手动输入地址；
- [ ] 只允许已配对设备访问数据；
- [ ] 同步项目、角色、Persona、聊天、世界设定和附件；
- [ ] 支持全部项目或指定项目同步；
- [ ] 在线设备尽量在数秒内收到变更；
- [ ] 离线设备恢复连接后自动补传；
- [ ] 显示已同步、同步中、离线、冲突和失败状态；
- [ ] 大文件分块传输、断点续传和哈希校验；
- [ ] 删除操作可恢复，避免误删传播；
- [ ] 同一内容被多设备修改时不能静默覆盖。

### 4.5 局域网安全

- [ ] 通信加密；
- [ ] 设备身份验证；
- [ ] 配对码短期有效且只能使用一次；
- [ ] 可以立即撤销设备；
- [ ] 每次请求验证账号、设备和项目权限；
- [ ] 默认不向互联网暴露同步端口；
- [ ] 默认不收集聊天、角色和模型请求内容。

### 4.6 简单模式界面

主要页面建议包括：

- [ ] 欢迎页和最近项目；
- [ ] 项目列表；
- [ ] 角色库；
- [ ] 聊天页面；
- [ ] 世界设定页面；
- [ ] 模型连接页面；
- [ ] 设备与同步页面；
- [ ] 应用设置页面；
- [ ] 进入高级模式的明确入口。

设计原则：

- 默认只展示当前任务必要的选项；
- 使用用户语言，而不是内部技术术语；
- 高级配置集中放置；
- 保持原有能力可访问；
- 同步状态随时可见但不干扰聊天；
- 优先支持中文和英文。

### 4.7 模型连接

底层继续保留 SillyTavern 原有供应商适配，简单模式优先推荐：

- OpenAI-compatible API；
- OpenRouter；
- Ollama；
- 自定义本地模型地址。

简单模式目标：

- [ ] 连接向导；
- [ ] 自动测试地址和密钥；
- [ ] 自动读取模型列表；
- [ ] 常用参数预设；
- [ ] 高级参数默认隐藏；
- [ ] API 密钥存入操作系统安全凭据存储。

### 4.8 SillyTavern 兼容性

- [ ] 保持 Character Card V2/V3 兼容；
- [ ] 保持 SillyTavern JSONL 聊天兼容；
- [ ] 保持基础和高级 World Info 数据；
- [ ] 尽可能保留 Swipe、聊天元数据和附件引用；
- [ ] 不支持的字段不能静默丢失；
- [ ] 后续支持迁移完整 SillyTavern 用户目录；
- [ ] 保留扩展基础设施，但第一版不保证所有第三方扩展适配简单模式。

### 4.9 数据保护

- [ ] 原子写入；
- [ ] 本地自动快照；
- [ ] 最近版本恢复；
- [ ] 升级前备份；
- [ ] 数据格式版本和迁移机制；
- [ ] 同步前后完整性校验；
- [ ] 完整账号数据导出；
- [ ] 聊天保存失败时明确提示。

### 4.10 角色成长与分级记忆

- [ ] 原始角色卡只读保护和本地快照；
- [ ] 每条聊天分支拥有独立的成长状态和记忆；
- [ ] A/B/C 事件提取、来源追踪和可信度；
- [ ] A 类人格变化审核；
- [ ] 记忆淡出、恢复、升级、降级和纠错；
- [ ] 根据重要性、相关性、近期程度和重复程度选择记忆；
- [ ] 成长状态和相关记忆具有独立提示词预算；
- [ ] 消息编辑、删除和 Swipe 后使失效记忆退出提示词；
- [ ] 记忆版本历史和一键恢复；
- [ ] 完全关闭后不改变 SillyTavern 原有生成结果。

## 5. 渐进式开发路线

### 阶段一：保留原系统并完成桌面基础

1. 将官方 SillyTavern 源码作为项目开发基线；
2. 确认和完善原项目已有的 Electron 入口；
3. 让 Electron 可靠启动和关闭本地服务；
4. 确认数据目录、日志和异常恢复；
5. 生成第一个可运行的 Windows 开发版本。

### 阶段二：简单模式和项目入口

1. 增加简单主页和项目列表；
2. 整理角色、聊天、模型连接的常用入口；
3. 保留高级模式；
4. 增加项目导入、导出和备份；
5. 验证现有角色卡、聊天和扩展没有被破坏。

### 阶段三：角色成长与分级记忆

1. 独立记忆目录、本地接口和格式版本；
2. 手动记忆、成长状态和提示词注入验证；
3. AI 事件提取与 A 类变化审核；
4. 遗忘、相关记忆选择和提示词预算；
5. 编辑、删除、Swipe 和聊天分支一致性；
6. 与原版及自动摘要的长线对比测试。

### 阶段四：局域网账号和同步

1. 本地账号和设备身份；
2. 局域网发现与安全配对；
3. 项目范围同步；
4. 离线队列和断点续传；
5. 冲突检测与恢复；
6. 多设备真实场景测试。

### 阶段五：扩展与发布完善

1. 改善群聊的简单模式界面；
2. 增加更多桌面集成；
3. 验证第三方扩展兼容性；
4. 自动更新；
5. Windows、macOS、Linux 正式发布流程。

## 6. 明确不采用的起步方式

除非以后经过重新讨论，不采用以下起步方式：

- 从零重写 SillyTavern；
- 一开始更换前端框架；
- 重写 Prompt Manager；
- 合并两套提示词编译路线；
- 删除原有群聊；
- 删除复杂 World Info；
- 删除大量模型供应商；
- 直接改变角色卡或 JSONL 格式；
- 让局域网同步逻辑侵入回复生成流程。

## 7. 开发约束

- 所有改动应小步进行、可以验证、尽量可以撤回；
- 优先新增隔离模块，而不是大范围修改核心文件；
- 修改核心生成逻辑前必须给出明确理由并获得确认；
- 修改数据格式前必须提供迁移和恢复方案；
- 简单模式不能以破坏高级模式为代价；
- 每个阶段都应验证角色卡、聊天记录和提示词行为；
- 不应静默覆盖或删除用户数据；
- 不应把 API 密钥、聊天或角色数据上传到未经确认的外部服务。

## 8. 上游基线与许可证

前期分析使用的官方基线：

- 仓库：`SillyTavern/SillyTavern`；
- 分支：`release`；
- 分析时包版本：`1.18.0`；
- 分析快照提交：`8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8`；
- 快照日期：2026-07-07。

SillyTavern 使用 AGPL-3.0 许可证。项目直接使用和修改其源码时，应继续遵守相应许可证要求。

## 9. 历史起步建议

> 本节保留项目最初的起步决策，已经执行完成，不再代表当前下一步。当前完成度和后续计划请看 `PROJECT_STATUS.md`。

第一次开发建议只完成以下内容：

1. 将选定的 SillyTavern `release` 基线正式放入当前项目；
2. 检查原有 Electron 目录和启动方式；
3. 记录现有 Electron 能做什么、缺少什么；
4. 在不修改聊天核心的前提下，启动第一个 Electron 开发窗口；
5. 输出验证结果和下一步建议。

第一次开发不应同时实现简单模式或局域网同步，以免无法判断基础打包问题来自哪里。

## 10. 本机文件与数据路径基线（2026-08-10 合并确认）

2026-08-10 经项目所有者确认，原开发目录与便携目录已无损合并为一个工作目录。本节以下路径取代旧的 `F:\matth\Documents\sillytavern-leslie` 与 `F:\AI\Leslietavern` 运行路径。除非项目所有者再次明确确认迁移，不得自行切换、合并、覆盖或清理这些数据目录。

### 10.1 项目、配置与桌面启动器

- 唯一项目根目录：`D:\Projects\sillytavern-leslie`
- 开发配置文件：`D:\Projects\sillytavern-leslie\config.yaml`
- 日常聊天安全配置：`D:\Projects\sillytavern-leslie\Config\config.yaml`
- Electron 入口：`D:\Projects\sillytavern-leslie\src\electron\index.js`
- 日常聊天 Electron：`D:\Projects\sillytavern-leslie\Runtime\electron.exe`
- 日常聊天启动器：`D:\Projects\sillytavern-leslie\启动 LeslieTavern.cmd`
- 桌面运行日志：`D:\Projects\sillytavern-leslie\logs\desktop`

### 10.2 唯一正式数据根目录

- **唯一正式数据根目录**：`D:\Projects\sillytavern-leslie\data`
- 当前正式用户目录：`D:\Projects\sillytavern-leslie\data\default-user`
- 角色卡：`D:\Projects\sillytavern-leslie\data\default-user\characters`
- 单角色聊天：`D:\Projects\sillytavern-leslie\data\default-user\chats`
- 群聊定义：`D:\Projects\sillytavern-leslie\data\default-user\groups`
- 群聊记录：`D:\Projects\sillytavern-leslie\data\default-user\group chats`
- World Info / 世界书：`D:\Projects\sillytavern-leslie\data\default-user\worlds`
- Persona 头像：`D:\Projects\sillytavern-leslie\data\default-user\User Avatars`
- 用户设置及 Persona 等映射：`D:\Projects\sillytavern-leslie\data\default-user\settings.json`
- 本机 API 密钥：`D:\Projects\sillytavern-leslie\data\default-user\secrets.json`
- 使用统计：`D:\Projects\sillytavern-leslie\data\default-user\stats.json`
- 用户备份：`D:\Projects\sillytavern-leslie\data\default-user\backups`
- 背景图：`D:\Projects\sillytavern-leslie\data\default-user\backgrounds`
- 用户资源：`D:\Projects\sillytavern-leslie\data\default-user\assets`
- 用户图片目录：`D:\Projects\sillytavern-leslie\data\default-user\user`
- 扩展数据：`D:\Projects\sillytavern-leslie\data\default-user\extensions`
- 缩略图缓存：`D:\Projects\sillytavern-leslie\data\default-user\thumbnails`
- Leslie 记忆：`D:\Projects\sillytavern-leslie\data\default-user\leslie\memory`
- Leslie 记忆归档：`D:\Projects\sillytavern-leslie\data\default-user\leslie\memory-archive`
- 账号存储：`D:\Projects\sillytavern-leslie\data\_storage`
- 临时上传：`D:\Projects\sillytavern-leslie\data\_uploads`
- SillyTavern 访问日志：`D:\Projects\sillytavern-leslie\data\access.log`
- 项目级人工备份：`D:\Projects\sillytavern-leslie\backups`

2026-08-10 合并核对：正式角色目录同时保留原开发角色与便携版新增角色，包括 `龙华妃咲`、`丹花伊吹`、`春日野穹`、`橘光`、`橘望`、`雨宫铃`和“小铃·中文语音测试”。两套合并前原始数据与源码快照位于：

`D:\Projects\sillytavern-leslie\backups\workspace-merge-20260810`

### 10.3 非正式目录与禁止事项

- 历史 Electron 全局目录、旧便携目录和测试夹具都不是当前正式数据目录；不得自动并入或覆盖正式数据。
- Electron 浏览器缓存与窗口状态位于统一根目录的 `Cache`；这里不是角色卡、聊天或 Leslie 记忆的正式存储位置。
- 不得让 `src/electron/index.js` 导入 `../server-global.js`；本项目 Electron 必须使用项目服务器入口 `../../server.js`。
- 日常聊天启动器必须显式传入：`--configPath D:\Projects\sillytavern-leslie\Config\config.yaml` 和 `--dataRoot D:\Projects\sillytavern-leslie\data`。
- 每次修改启动方式、Electron 入口、工作目录、配置路径或数据路径后，必须检查启动日志中的 `Using data root`，并确认它解析为唯一正式数据根目录。
- 数据路径变更前必须先做备份、向项目所有者说明影响并取得确认；不得静默迁移、删除或合并数据。

## 11. 当前状态入口

- 当前代码完成度、验证结果、已知风险和推荐实施顺序统一记录在 `PROJECT_STATUS.md`。
- `PROJECT_BRIEF.md` 继续作为长期目标、兼容性原则和固定数据路径的基线，不用短期进度覆盖这些内容。
- 每次完成一个开发阶段、改变启动/数据路径、修改记忆格式或调整总体计划后，都应同步更新 `PROJECT_STATUS.md`。
