---
created: 2026-10-22
---

# 页面地图：专家团管理面板（web）

平台：dsh desktop 工作台 web 面。单一入口 `main` 槽 keyed 面板（`expert-squad`），面板内一层 Dialog，无路由跳转。

## 页面/视图清单

| 视图 | 落位 | 内容 | 状态 |
|---|---|---|---|
| 面板·卡片网格（主视图） | main 槽面板 | 搜索/状态过滤/[召唤]/卡片网格/计数页脚 | 加载骨架 · 空 · 错误 · 数据 |
| 详情 Dialog | 面板内 Modal | 查看（简介/人设 md 渲染/白名单/技能）⇄ 编辑（岗位/简介/人设 textarea + multi-select×2） | 查看 · 编辑 · 校验错误 |
| 会话流（HR 预设） | 既有 conversation 页面（HR 预设，复用 chat-view） | HR 招聘对话；召唤会话默认绑定用户当前打开的工作区（dsh-forge 形态工作区按 workspaceId/cwd 归属解析对应项目后绑定） | 空（开场指引） · 对话中 · 建档回执 |

## 导航规则

- 工作台面板入口（main keyed 行）→ 面板主视图；无次级页面
- 面板内唯一 Modal = 详情 Dialog；Esc/遮罩/✕ 关闭
- 召唤会话为既有会话流页面（`conversation`，HR 预设），与详情 Dialog 无互斥面；插件不注入其布局，仅 HR/使用方对话产档案后联动面板刷新

## 数据通道

- 面板 ↔ 插件：`/api/expert-squad/*`（fetch.register 路由，zod 门）
- 联动机制：待核销决策 D2（fetch 即时 + 轻轮询兜底，或官方事件缝）
