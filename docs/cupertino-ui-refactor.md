# Leslie Cupertino UI 重构

> 状态：第一阶段可用，动效优化已完成
>
> 范围：表现层、布局和可访问性；不改变聊天数据、生成流程或 SillyTavern 兼容边界

## 目标

Leslie 的新界面采用 Apple Human Interface Guidelines 的层级、排版、触控和材料原则，并结合 iMessage 的消息表达与 WhatsApp iOS 的列表信息架构。它不是 Apple 产品的像素级复刻，也不使用 Apple 专有字体、SF Symbols 或官方 UI Kit 资产。

针对 Leslie 的长篇角色扮演场景，新设计保留较宽的消息正文、Markdown、代码、图片、音频、Swipe、群聊、角色头像和模型状态；手机端才更接近紧凑的即时通信布局。

## 技术原则

- 保留 SillyTavern 的现有 DOM、元素 ID、事件和数据流程。
- 新设计通过 `data-leslie-design-language="cupertino"` 启用；经典界面使用 `classic`。
- 设计语言只保存在浏览器 `localStorage` 的 `leslie.design.language`，不进入角色卡、聊天 JSONL、用户设置或服务端数据。
- Cupertino CSS 必须全部受设计语言选择器约束，禁止无条件覆盖经典主题。
- 材料和模糊只用于导航、输入栏、菜单等功能层；消息和设置内容保持稳定的不透明表面。
- 所有关键点击目标不小于 `44 × 44px`，支持键盘焦点、减少动态效果与减少透明度偏好。
- Leslie 模块失效时普通聊天仍需可用。

## 动效规范

动效遵循 Apple [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) 与 [Reduced Motion](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria) 指南：只用于反馈、状态和层级变化，不把装饰性动画加入高频操作。

- 直接按压反馈使用约 `70–160ms`，消息、菜单和页面层级变化使用约 `160–300ms`。
- 动效不能阻塞点击、输入、返回或消息生成；没有等待动效结束才能继续的流程。
- 新消息只在首次插入时动一次；恢复整段聊天历史时不逐条播放。
- 不使用持续漂浮、循环呼吸、视差、旋转或大幅弹跳。
- 系统启用“减少动态效果”时，不执行位移、缩放和菜单弹出动画，导航仍通过可见性与状态变化保持可理解。
- 动效样式全部受 Cupertino 设计语言选择器约束，经典界面不加载这些表现。

## 第一阶段

第一阶段只覆盖：

1. 亮色和暗色语义设计令牌；
2. 会话栏、搜索和会话筛选；
3. 聊天头部和菜单；
4. 收到、发出和系统消息气泡；
5. 输入区；
6. 桌面和手机响应式表现；
7. 经典设计语言的运行时回退入口。

设置、角色记忆、朋友圈和角色工坊暂时只继承新的语义颜色。后续阶段再逐页减少嵌套卡片并改成分组列表，不在第一阶段同时重写。

## 回退准备

重构前的干净基线是提交 `840244c10`，本地保护分支为：

```text
backup/pre-cupertino-ui-20260920
```

重构工作位于：

```text
feat/cupertino-ui-refactor
```

动效优化前的本地保护分支为：

```text
backup/pre-cupertino-motion-20260920
```

优先使用无损运行时回退：

1. 点击会话栏或聊天头部的半明半暗图标；
2. 在“设计语言”中选择“经典”；
3. 如需恢复原始 SillyTavern 布局，再从聊天菜单选择“暂时使用原版布局”。

运行时回退只改变本地表现偏好，不修改聊天内容或角色数据。

需要撤销整个重构分支时，从保护分支新建工作分支，不对包含用户修改的工作树执行强制重置：

```bash
git switch -c recover/pre-cupertino backup/pre-cupertino-ui-20260920
```

## 验证矩阵

- 设计语言：Cupertino、经典；
- 色彩模式：自动、亮色、暗色；
- 窗口：`390px` 手机、`700px` 临界宽度、`1280px` 桌面；
- 聊天：普通单聊、群聊、系统消息、长 Markdown、代码、图片、音频；
- 操作：发送、停止、Swipe、编辑、重新生成、历史聊天、角色卡和记忆入口；
- 辅助功能：键盘焦点、44px 触控目标、减少动态效果、减少透明度；
- 回退：经典主题、原版布局和保护分支均可独立恢复。

## 后续阶段

1. 把设置页改成 Apple 风格分组列表；
2. 统一角色记忆、朋友圈和角色工坊的导航与表单；
3. 拆分过大的 Leslie 前端模块；
4. 建立视觉截图基线和跨主题回归；
5. 最后再评估是否抽取内部组件库，不先引入 React、Vue、Ionic 或完整 Framework7 运行时。
