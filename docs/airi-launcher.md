# LeslieTavern 与 AIRI 启动和使用指南

## 项目布局

LeslieTavern 与 AIRI 已合并为一个 Git 工作树：

```text
D:\Projects\Leslietavern\
├─ .git\                  唯一 Git 元数据
├─ airi\                  AIRI 桌面前端源码
├─ src\                   LeslieTavern 服务端和桌面壳
├─ data\                  本地用户数据
├─ Runtime\               本地 Electron 运行时
├─ Config\                本地运行配置
└─ 启动中心.cmd           统一入口
```

整个目录只使用根目录的 `.git`。`airi/` 不包含嵌套 Git 元数据，也不保留单独的上游 remote。根仓库的 `origin` 是本项目自己的发布和推送目标。

两个 Node.js 应用仍保留各自的包管理边界：根目录使用 npm，`airi/` 使用 pnpm。这样可以避免混合锁文件，同时仍由一个仓库统一版本化和发布。

## 日常启动

最简单的用法是双击 `启动 LeslieTavern 与 AIRI.cmd`。正常情况下只会出现两个主窗口：LeslieTavern 和 AIRI。启动过程使用的命令窗口会在完成后自动关闭，AIRI 不再弹出首次配置向导。

双击 `启动中心.cmd`，然后选择：

1. 只启动 LeslieTavern。
2. 同时启动 LeslieTavern 和 AIRI。
3. 停止 AIRI 和 LeslieTavern。
4. 检查路径、端口、构建产物和运行时。
5. 重新构建 AIRI，再同时启动两个应用。

也可以使用直接入口：

- `启动 LeslieTavern.cmd`：只启动 LeslieTavern。
- `启动 LeslieTavern 与 AIRI.cmd`：直接联合启动。
- `关闭 LeslieTavern 与 AIRI.cmd`：停止联合启动的两个应用。

## 联合启动过程

联合启动器会依次执行：

1. 检查根目录内的 `airi/` 子系统。
2. 生成一次性的 32 字节随机桥接令牌。
3. 使用现有 `Runtime/`、`Config/` 和 `data/` 启动 LeslieTavern。
4. 等待 Leslie Bridge v1 健康检查通过。
5. 检查 AIRI 桌面构建；构建缺失或源码较新时自动运行生产构建。
6. 使用同一个进程令牌和本机 Bridge URL 启动 AIRI。

令牌不会写入配置、源码、日志或用户数据。关闭应用后令牌失效。

## 首次准备

LeslieTavern 需要：

- `Runtime/electron.exe`
- `Config/config.yaml`
- 已安装的服务端依赖
- 本地 `data/` 用户目录

AIRI 需要已经安装依赖。当前工作区已经完成安装。以后重新克隆整个项目时，在根目录安装 LeslieTavern 依赖，再进入 `airi/` 安装锁文件依赖：

```powershell
cd D:\Projects\Leslietavern
npm ci
npm ci --prefix src/electron
npm ci --prefix tests
cd airi
pnpm install --frozen-lockfile
```

自动构建需要 Node.js 20 或更高版本。启动器按以下顺序寻找 Node.js：

1. `LESLIE_NODE_EXE`
2. 系统 `PATH` 中的 `node.exe`
3. 本机 Codex bundled runtime

## 连接角色并开始聊天

在 LeslieTavern 中：

1. 像平常一样配置聊天 provider、模型和 API 密钥。
2. 打开或创建一个角色聊天，并点选你希望 AIRI 扮演的角色。
3. 如需语音，在 LeslieTavern 的火山引擎语音设置中保存 App ID、Access Key，并为该角色分配音色。

在 AIRI 中：

1. 不需要选择 provider、模型或音色。
2. 看到右上角状态变成“已绑定 LeslieTavern 角色”后，直接输入文字或使用麦克风。
3. 如需更换外观，只打开 AIRI 设置中的“角色形象”，选择 3D、Live2D 或其他显示模型。

AIRI 只把最新一条用户输入交给 LeslieTavern。LeslieTavern 使用当前角色的角色卡、Persona、World Info、提示词扩展、记忆、聊天记录和当前模型生成回复，并把回复保存到当前聊天。AIRI 再显示回复，并使用当前角色绑定的火山音色播放。

切换角色时，只需要在 LeslieTavern 中点选另一个角色。AIRI 会在几秒内自动跟随，不需要重新配置接口。AIRI 的显示模型保持不变，用户可以在“角色形象”中手动更换；按角色自动记住不同显示模型属于后续优化项。

## 数据和日志

- Leslie 用户数据：`data/`
- Leslie 桌面日志：`logs/desktop/`
- AIRI 启动日志：`logs/airi/`
- 本地进程状态：`Run/`
- AIRI 构建输出：`airi/apps/stage-tamagotchi/out/`

这些本地目录不会进入 Git。不要把日志、用户数据、角色卡、聊天正文或密钥提交到仓库。

## 网络安全

AIRI 始终通过 `127.0.0.1` 连接 Bridge。LeslieTavern 的普通桌面服务仍遵循 `Config/config.yaml`。

如果诊断结果显示 LAN listener 为 `enabled`，LeslieTavern 也会监听局域网。`whitelistDirectPrivateNetworks` 只自动放行访问所用本机地址的同一私有子网，无需为手机或平板逐个添加 IP，切换家庭 Wi-Fi 或手机热点也不必改配置；公网和未用于当前连接的其他网段不会随之开放。Windows 防火墙仍应限制在可信本地子网。只需要本机访问时，把 `Config/config.yaml` 中的 `listen` 改为 `false`。

## 故障排查

先从启动中心选择第 4 项。常见问题：

- 找不到 AIRI：确认项目根目录包含完整的 `airi/package.json`。
- AIRI 没有构建或界面仍是旧版：停止两个应用后重新联合启动；启动器会检测源码时间并自动重建。也可以选择第 5 项强制重建。
- 找不到 Node.js：安装 Node.js 20+ 或设置 `LESLIE_NODE_EXE`。
- Leslie 已经运行：先选择第 3 项停止，再联合启动。
- AIRI 无法连接：确认两个应用来自同一次联合启动。
- AIRI 显示“等待角色”：在 LeslieTavern 中打开一个聊天并选择角色，保持 LeslieTavern 主窗口已加载完成。
- AIRI 有文字但没有语音：在 LeslieTavern 中检查当前角色的火山音色映射、App ID 和 Access Key。
- 启动后立即退出：检查 `logs/desktop/` 和 `logs/airi/`。
