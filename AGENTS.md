# Workspace Conventions

## UI/engineering alignment conventions

- **完全对齐官方 dsh 逻辑，尽量复用官方组件**（用户裁决 2026-10-14）：本项目自建 host 与 UI 层，组合官方组件需要写的**胶水代码**（装配、透传、状态缝合）是允许且预期的交付物；但**不自行编写组件**——官方已有同语义组件/机械（Modal、Switch、dialog 形态、配对/认证流程等）一律复用官方件，产品层只做组合与注入。
- 对齐判据 = 官方实机形态逐位对照（布局、交互词汇、状态语义、刷新/超时机制），不是「语义近似」；走查取证截图归档 `.forge/docs/proposals/<slug>/walkthrough/`（留盘不进 git）。

## DESIGN.md conventions

- **根目录 `DESIGN.md` = 本项目设计系统规范**：从源码提取（官方 `@deepseek-ai/dsh-client-ui-theme` 令牌 + 产品自绘面 `.dswf-*`），首要原则是**样式尽量跟 dsh 对齐**，非独立设计语言。
- **何时使用**：
  - 写任何 UI 代码（新视图、组件、样式）前先读 `DESIGN.md`——取色/字/距/圆角/阴影一律按其令牌表与 Do's/Don'ts，不凭记忆猜值。
  - 做 ui-design 类技能或设计走查时，`DESIGN.md` 是设计侧唯一基准（替代参考外部风格模板）。
  - 评审 UI 改动、判断「像不像 dsh」时，以其对齐判据（官方实机逐位对照）为口径。
- **何时更新**：令牌消费面出现新自绘形态、或官方包版本升级导致令牌值变化时，同步回写 `DESIGN.md`；文档只呈现当前事实，不记调整修复叙事。

## Upstream dependency conventions

- **官方上游包允许直接 import，禁止 vendor**（用户裁决 2026-10-14，溯及澄清 dsh-forge-redesign §vendor 裁决）：「不 vendor」只约束不拷贝官方源码进仓；依赖官方 npm 公开包 + 版本精确 pin 是既定正道（host 依赖三十余个 `@deepseek-ai/*` 包为证）。
- **不存在「零上游 import」全局口径**：该纪律仅是个别产品自建模块的局部决策（事件总线裁决⑧、notify 通道等），不得放大为项目级约束，也不得据此用 `ctx.reflect.get(name)` 丢类型取法规避类型化 import。
- **Cordis 可选具名服务取法**：优先 type-only import 官方包（保留 `ctx.<service>` 具名服务全量类型安全）+ 运行期存在性检查承担 fail-soft；`ctx.reflect.get` 仅限有其局部成因的既有先例，不作为新代码默认配方。
- 先例：`mobile-remote-approval/disc-1`（审批桥接面配方修正）。

## Commit conventions

- **不要提交过程文件**（用户裁决 2026-10-10）：走查截图、临时取证图、探针脚本输出等过程产物一律不进 git 提交。
  - `.forge/docs/**/*.png` 已被 `.gitignore` 默认忽略——**禁止 force-add**（d32/d35 的 force-add 归档是旧先例，已被本裁决取代）。
  - 过程文件归档到 `.forge/docs/proposals/<slug>/walkthrough/` 等工作区目录即可（留在盘上、留在 git 外），在提交说明里用相对路径引用。
  - 提交只含代码、测试与文档（`.md` 台账/走查记录属文档，可提交）。
