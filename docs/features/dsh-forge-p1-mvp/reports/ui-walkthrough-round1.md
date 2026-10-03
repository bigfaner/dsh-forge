---
feature: "dsh-forge-p1-mvp"
date: "2026-10-03"
type: "ui-walkthrough-report"
round: 1
reviewer: "用户实机走查 + 会话复核（静态审计 / 静态门 / 单测实跑 / CDP 实机截图）"
---

# UI 走查复核报告（第 1 轮）

> 走查时点：阶段 3 全部完成 + 3.gate 通过、fix-1 完成、4.1/4.2 完成、4.3 进行中。
> 复核口径：以 dsh 官方风格为底子（官方件复用 + 令牌唯一）；**走查未点名要调整的元素一律保持现状**。
> 纪律声明：本轮只产出报告与追加任务，未修改任何代码。

## 0. 走查输入与环境说明

- **输入**：用户实机走查提出 3 项视觉差异（标题栏 / 文件浏览器尺寸 / dock 样式）；会话侧完成 UF-1~7 静态符合性审计 + 三大流程功能审计（另见 §4）。
- **验证实跑**：`pnpm lint` 五门全绿（ox / imports / tokens 0 裸值 / selftest 14 负样例 / types）；`vitest run` **914/914 全绿**（96 文件）。
- **环境澄清（重要）**：本会话曾复跑 e2e 出现 12 用例启动全挂 —— 根因查明为**本 harness 会话继承的宿主环境变量将 electron 毒化为 node 形态**（`dist/main.js` 报 `electron 模块无 BrowserWindow 导出`），**非产品回归**。以净化环境（最小 env 集）+ CDP 直连后应用正常启动、截图全部拍得。并行会话的 e2e（4.2 记录 10/10、flywheel 连续 4 绿）不受影响。
- **截图方法**：产品 = dev 形态 + 隔离 userData + 官方首启模态预确认叠层；原型 = `proto-boot.mjs` 无框 1440×900 窗（原型设计意图 = 无系统标题栏）。产物见 [shots/](./shots/)。

## 1. 截图对照索引

| 场景 | 产品实机 | 原型基准 |
|---|---|---|
| 主视图（hero 相位） | [p1-main.png](./shots/p1-main.png) | [r1-main.png](./shots/r1-main.png) |
| 添加项目 · 段一文件浏览器 | [p2-addproject-browser.png](./shots/p2-addproject-browser.png) | [r2-addproject-browser.png](./shots/r2-addproject-browser.png) |
| 右栏 dock 展开态 | [p3-dock-expanded.png](./shots/p3-dock-expanded.png) | [r3-dock-expanded.png](./shots/r3-dock-expanded.png) |
| 知识视图（无项目锚引导空态） | [p4-knowledge.png](./shots/p4-knowledge.png) | — |

> 注：截图为佐证材料；差异判定以下列代码证据为准。

## 2. 走查差异判定（3 项，全部成立 → 派生修复任务）

### 2.1 顶部原生标题栏未隐藏 → **fix-2**

- **现象**：主窗口顶部为 Windows 原生标题栏；原型为网页、无此层。
- **根因**：`apps/host/src/window/create.ts:26-38` BrowserWindow 使用默认 `frame`。设计文档从未定义窗口形态（全 docs 检索「标题栏 / frameless / titleBar」零命中）——**设计空白，非实现走样**。
- **修复方向**：`titleBarStyle: 'hidden'` + `titleBarOverlay`（原生最小化/最大化/关闭钮保留、标题文字区消失、窗口可拖动），对齐 dsh 官方桌面形态；P1 不自绘平行标题栏模式。**其余窗口参数（尺寸 1440×900、加载行为、preload）不变。**

### 2.2 添加项目 · 文件浏览器偏小 → **fix-3（第 2 轮改判：模态裁切缺陷，两段同病）**

> **⚠️ 改判注记（2026-10-03 第 2 轮走查 + CDP 几何实测）**：走查人复报「段二表单左半边被隐藏、label 看不到」。实测根因 = 官方 Modal 卡片硬编码 380px + overflow hidden，产品把 560px 设在内容层 → 内容左溢 180px 被裁（表单行左缘 156px 不可见，label 全没）。段一「不够大」实为**同源裁切**而非尺寸审美。fix-3 已按新根因重写（宽度改挂官方 `className` 卡片挂点 + 补几何断言）。详见 [acceptance-round2.md](./acceptance-round2.md) §5。

- **现象**：段一文件浏览器观感「不够大」。
- **刻度事实**：按代码尺寸不小于原型——模态内容区 560px（原型 dialog 520px，`flow.css:12` vs 原型 `styles.css:1065`）；目录列表高 256px 与原型 `fb-list` 完全一致（`browser.css:80` vs `styles.css:1110`）。
- **观感成因**：官方 Modal 自带头部/内衬占高；列表 256px 定高在 900px 窗口占比低；模态高度自适应 + 垂直居中，四周留白多。
- **修复方向**：**有意超出原型**的放大——模态内容区 560 → ~680px（90vw 上限保持），列表高 256 → ~min(50vh, 480px)；**仅动段一浏览器相位**，段二表单模态尺寸与全部字段排布不变（走查拍板值可在执行时微调）。

### 2.3 右栏 dock（dockkit 位）样式乱 → **fix-4**

- **现象**：dock 页签条视觉拥挤杂乱。
- **根因（四处具体偏差，产品 vs 原型 `styles.css:800-829`）**：
  1. 页签条：官方 SegmentedTabs 满宽 + 收展钮同排零间距（`zones.css:68-74` `gap:0; padding:0`）vs 原型 28px 圆角 chips 行 + 10px/8px 内衬 + 尾部控制位；
  2. 宽度：固定 340px 无手柄 vs 原型 300 起 + `#rb-resize` 8px col-resize 拖拽调宽（300–70vw）；
  3. 内容区：无内衬（占位文本贴边）vs 原型 `4px 16px 20px`；
  4. 背景面：bg-layer-1 vs 原型 bg-base + 发线。
- **背景**：P1 机制最简版决策在案（2.5/2.6：dockkit DockSurface 引擎后续消费，本件只承载轨道收展 + 页签跟随），视觉未打磨属已知欠账。
- **修复方向（dsh 底子口径）**：**保留官方件**（SegmentedTabs / Button 不换自绘 chips —— 原型 chips 形态不采纳，只取其布局刻度）；strip 内衬与收展钮分区归位；补拖拽调宽手柄（令牌高亮）；dock body 补内衬。**机制语义（三态 / keep-alive / 页签跟随）与未点名元素零变化。**

## 3. UF-1~7 符合性总表（静态审计结论，含本轮截图佐证）

| UI Function | 判定 | 要点 |
|---|---|---|
| UF-1 左栏导航 rail | 🟡 部分符合 | 四态齐；搜索过滤未实现 = 2.7 记录在案出范围（PRD Validation 仍列——**口径不一致，待验收裁决或补任务**） |
| UF-2 首用 hero 空态 | ✅ | 正零判据 + 三刷新锚 + 永久让位；e2e 实跑（p1 截图 = hero 相位） |
| UF-3 两段式添加项目 | ✅ | 段一/段二/联动/取消点/一次性守卫全齐；尺寸观感差异见 §2.2（fix-3） |
| UF-4 会话面板三页签 | 🟡 部分符合 | 对话/召回 tab ✅；**轨迹 tab 数据未接线**（装配点未传 `transcript`，2.12 残留②原计划归 2.13/2.14 未落地——真缺口） |
| UF-5 中区视图互换 | ✅ | 态机 + keep-alive + 偏好恢复，11 用例 pin + e2e 断言 |
| UF-6 知识库浏览 | ✅ | 域树 224px / 网格 minmax(300px,1fr) / 抽屉右滑 min(520px,52vw) 逐项对齐原型；正文剥离 frontmatter |
| UF-7 右栏 dock | ✅（机制）/ 🟡（视觉） | 三态 + 页签跟随 8 用例 pin；视觉整理见 §2.3（fix-4） |

## 4. 功能侧同步发现（本轮走查附带，未派生任务）

- **reconcileAtStartup 已实现未接线**：`project-service.ts:237-344` 三层降级实现 + RPC 通道 + 测试全齐，但全仓无生产启动调用点（main.ts / boot child / web 装配均不调）——PRD 流程 1.8「每次启动对账」未自动化，一行接线即闭合。**建议随 4.gate 前的收尾批处理。**
- SC12 四断言（补偿删除/防误删/幂等/对账提示）目前仅 core 单测覆盖，e2e 故障注入面缺失（tech-design Testing 所列 SC12 e2e 未落）。
- 其余三大流程（注册补偿链 / 会话 / 知识飞轮）+ SC2 无投影纪律全数符合，证据见 4.2 flywheel e2e（三方一致断言）与 core 单测面。

## 5. 派生任务清单

| 任务 | 标题 | 优先级 | 预估 |
|---|---|---|---|
| fix-2 | 主窗口隐藏原生标题栏（titleBarStyle hidden + overlay） | P1 | 1h |
| fix-3 | 添加项目·段一文件浏览器放大（模态加宽 + 列表增高） | P2 | 30min |
| fix-4 | 右栏 dock 页签条整理（内衬 / 收展钮归位 / 拖拽调宽手柄） | P2 | 2h |

> 三任务共同边界：**以 dsh 官方风格为底（官方件复用 + 令牌唯一）；走查未点名元素保持不变；机制语义与既有 e2e 断言零褪色。**
