# LeslieTavern 统一工作目录

本目录现在同时承担日常聊天、项目开发和便携版构建三种用途。唯一工作目录是：

`D:\Projects\sillytavern-leslie`

## 日常聊天

双击根目录的 `启动 LeslieTavern.cmd`。程序固定使用：

- 程序源码：当前 Git 工作区；
- 用户数据：`data`；
- Electron 运行环境：`Runtime`；
- 本地安全配置：`Config\config.yaml`；
- 桌面运行日志：`logs\desktop`。

启动脚本会核对日志中的真实数据根目录。只要实际路径不是本目录的 `data`，脚本就会停止程序并报错，防止误用空白数据目录。

## 数据与备份

`data` 保存角色卡、聊天、Persona、世界书、API 密钥、Leslie 记忆和朋友圈。它被 Git 忽略，不会随源码上传 GitHub。

退出程序后双击 `备份用户数据.cmd`，备份会进入 `backups\UserData`。本次合并前的两套完整原始数据、源码快照，以及原便携配置、脚本和清单位于 `backups\workspace-merge-20260810`；原便携历史程序备份与日志位于 `backups\portable-history-before-merge`。原便携完整目录还保留为根目录下的 `legacy-portable-package`，仅用于迁移回退并被 Git 忽略。

## 继续开发

源码、测试、文档和 Git 历史都保留在根目录。`data`、`Runtime`、`Config`、缓存、日志和备份不会出现在 Git 提交中。开始修改前先阅读 `AGENTS.md`、`PROJECT_BRIEF.md` 和 `PROJECT_STATUS.md`。

## 构建可分发便携版

在 PowerShell 中运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\packaging\windows-portable\build-portable.ps1 -OutputPath .\dist\LeslieTavern
```

构建脚本不会复制 `data`、聊天、角色、密钥、记忆或项目备份；成品使用空白的独立 `UserData`。因此 `dist\LeslieTavern` 可以用于分发，而根目录继续用于个人聊天和开发。
