---
feature: "dsh-forge-p1-mvp"
date: "2026-10-03"
type: "acceptance-report"
round: 2
reviewer: "会话独立复核（静态门 / 全量单测 / CDP 实机走查 / 规格一致性扫描）"
---

# 验收补充报告（第 2 轮 · 全面排查）

> 承接 [ui-walkthrough-round1.md](./ui-walkthrough-round1.md)。本轮目标：当前 HEAD 全面验收 + 排查其它问题。
> 验收基线：commit `9caca5e`（4.1 安装包管线）；并行会话 4.3 仍 in_progress（17:35 起）。

## 1. 独立验证通过项（本会话实跑）

| 验收面 | 结果 | 说明 |
|---|---|---|
| 静态门 `pnpm lint` | ✅ | 五门全绿（ox / imports / tokens 0 裸值 / selftest 14 负样例 / types tsc -b） |
| 全量单测 `pnpm test` | ✅ | **914/914**（96 文件，12.2s） |
| 实机运行（CDP 直连） | ✅ | 应用正常启动：boot 就绪 → hero 相位 → 添加项目浏览器（真实目录列举）→ dock 展开 → 知识视图（截图见 [shots/](./shots/)） |
| 源码卫生扫描 | ✅ | apps/ + packages/ 源码零 TODO / FIXME / HACK 标记 |
| 任务索引完整性 | ✅ | index.json 50 任务解析正常；fix-2/3/4 登记在位且未并行丢失 |

## 2. 新发现问题

### 2.1 ⚠️ hash8 规格漂移（跨里程碑未闭环，需裁决）

并行会话有**未提交**的总纲修订（2026-10-02 M2 细化）：任务清单与记录路径 = `{dsh-forge-home}/{扁平化}-{hash8}`（原路径 sha-256 前 8 hex 消歧后缀，防 `C:\a\b` 与 `C:\a-b` 同名 `C-a-b` 碰撞）。原型四件（app.js / data.js / smoke-ui.cjs / README）与新增 `docs/proposals/dsh-forge-m2-pipeline/`（含 §6-34 裁决记录）已同步新规则。

**未跟齐的面（全部停留在旧规则）：**
- 产品：[form-model.ts:76-88](../../../apps/web/src/flows/add-project/form-model.ts) `flattenWorkspacePath` / `deriveTaskStoreDir` 无后缀
- PRD：prd-spec 流程一第 3 步、prd-ui-functions UF-3 数据表均无 hash8
- e2e：smoke-skeleton 向导组断言期望值 `~/.dsh-forge/{flatten}` 无后缀（[smoke-skeleton.spec.ts:356](../../../e2e/specs/smoke-skeleton.spec.ts)）
- 断言文本漂移：原型 L771/L810 断言已改「扁平化 + hash8 消歧后缀」，台账迁移副本仍是旧文本

**影响评估**：P1 无任务域（路径仅表单只读预览「未来位置」），不构成 P1 功能缺陷；但总纲修订一旦提交，P1 表单预览、PRD、e2e 即与宪法不一致。

**两个处置选项（待裁决）**：
- A. P1 即刻对齐：小任务改 `deriveTaskStoreDir` + PRD 两处 + smoke 断言（~30min，随 fix 批处理）
- B. 显式延后 M2：PRD 加注「路径形态以 M2 裁决③为准」，M2 落地时统一兑现（M2 提案已声明「注册表单只读行不撒谎」目标）

### 2.2 ℹ️ e2e 运行环境限制（非产品问题）

playwright `_electron.launch` 在本 harness 会话结构性失败（stdio 管道进程派生被运行环境限制；净化环境变量亦无法绕开——已实测三轮）。本会话的第一手运行时验证改经 spawn(stdio:ignore) + CDP 直连完成。**playwright e2e 的有效性以并行会话提交记录为准**（4.2：全量 10/10、flywheel 连续 4 绿）。注：并行会话能实跑 e2e，说明其执行环境不同；本轮其 test-results 曾出现失败痕迹后清理，属其 4.3 迭代过程。

### 2.3 ℹ️ 杂项

- `du.exe.stackdump`（根目录）：磁盘工具崩溃残留，可删；与「C 盘满」已知约束相关。
- `.claude/`（根目录，未跟踪）：并行会话工具产物，无害。
- 总纲修订 + M2 提案 + installer-smoke.spec 均未提交：并行会话进行中工作，建议其收尾时一并提交，避免验收基线悬空。

## 3. 已知问题清单（第 1 轮已立案 + 本轮状态）

| # | 问题 | 状态 | 载体 |
|---|---|---|---|
| 1 | 原生标题栏未隐藏 | 已立案 | fix-2（P1） |
| 2 | 文件浏览器偏小 | 已立案 | fix-3（P2） |
| 3 | dock 页签条样式乱 | 已立案 | fix-4（P2） |
| 4 | UF-4 轨迹 tab 数据未接线（ChatSnapshot→TranscriptEntry 映射） | ⚠️ 未立案——2.12 残留②原计划归 2.13/2.14 已过期，建议随 fix 批立任务 | 报告 R1 §3 |
| 5 | reconcileAtStartup 已实现未接启动时序（PRD 流程 1.8） | ⚠️ 未立案——一行接线，建议 4.gate 前收尾 | 报告 R1 §4 |
| 6 | SC12 四断言无 e2e 故障注入面 | 已记录（tech-design Testing 缺口） | 报告 R1 §4 |
| 7 | UF-1 搜索过滤：PRD 列了、2.7 记录出范围 | 待验收口径裁决 | 报告 R1 §3 |
| 8 | hash8 规格漂移（本轮新发现） | ⏳ 待裁决（§2.1 选项 A/B） | 本报告 §2.1 |

## 4. MVP 门状态

- 第一步（飞轮 6 步链 dogfood）：✅ 4.2 完成（连续 4 绿 + 三方一致断言）
- 第二步（安装包 4 步冒烟）：✅ 4.3 完成（并行会话，本轮验收期间收尾）
- 4.summary / 4.gate：✅ 完成——**P1（M0+M1）全阶段收官**（走查发现的 fix 批任务为收官后追加验收缺陷，不影响门记录）

## 5. 第 3 轮补录（2026-10-03 · 走查人实机复报 + CDP 深查）

### 5.1 fix-3 改判：模态裁切缺陷（几何实锤）

走查人复报「添加项目表单左半边被隐藏、label 看不到」。CDP 几何实测：官方 Modal 卡片 380px（x=531，overflow hidden），产品内容层 560px（x=351）→ 左溢 180px，表单行左缘 156px 被裁、label 全不可见。**段一「文件浏览器不够大」为同源缺陷**。R1 §2.2 已加改判注记，fix-3 任务按新根因重写（宽度迁至官方 `className` 卡片挂点，`clsx(css.dialog, className)`；补 L3 式几何断言堵 e2e 盲区——DOM 值断言看不见视觉裁切）。优先级 P2 → **P1**。

### 5.2 新立 fix-5：知识浏览关键词交互缺陷（P1 功能缺陷，复现 4/4）

M1 知识视图键入关键词（`keyboard.type`/`fill` 均触发，ASCII/CJK 均然）→ ①输入框受控值弹回空；②卡片网格容器整体从 DOM 消失；③域树/计数/锚点保留；④面落「尚无知识」空库引导；⑤无过渡面无 pageerror；⑥永久停留。四轮探针排除：崩溃/重挂载（DOM 标记存活）/异步会话（静置 40s 稳）/锚点漂移。疑点收敛于 use-knowledge-browse 过滤装载链（`fetchFilteredCards` 空结果落 `cards:[]` 与观测吻合，但过滤态随后被复位为 '' 的写入者待插桩）。**4.2/3.8 e2e 未覆盖手动键入路径，属盲区**——fix-5 含补测要求。复现脚本：`tmp-ui-review/markerprobe.mjs`（净化 env + CDP 直连）。

### 5.3 其余全流程走查结论（walk3，16 项 PASS）

注册全流程（hero→浏览器→表单回填→执行→成功→左栏项目行）＋ 知识索引 3 条呈现 ＋ 域前缀过滤（3→2，后端条目不在场，场景④ UI 侧）＋ 抽屉（摘要/元数据/正文剥离 frontmatter/Esc 上下文保持）＋ 召回 tab 空态 —— **全部第一手实测通过**；唯一失败项即 fix-5 关键词步骤。

### 5.4 任务台账更新

- fix-3：改判重写（P1，1h）
- fix-5：新立（P1，2h）
- index.json 51 任务（4.x 全 completed + fix-2/3/4/5 pending），node 解析验证通过

## 6. 第 4 轮补录（2026-10-03 · 走查人复报：侧栏按钮缺失 + dock 预期核查）

### 6.1 侧栏项目区缺搜索钮与视图选项（排列）钮 → **fix-6 新立（P1）**

原型项目区头部四件（label + 搜索钮含过滤行 + 视图选项钮 + ％＋），产品只做了 label 与 ＋ 两件（ForgeWorkspacePanel.tsx:216-223）。搜索 = PRD UF-1 Validation 在案（2.7 曾注记出范围，走查翻案落实——「P1 最简：前缀/子串匹配，不改变选中态」）；视图选项 = 原型基准占位件（菜单内容归后续里程碑）。fix-6 已立案并登记 index.json。

### 6.2 右侧 dock（dockkit 位）预期核查结论

| 预期来源 | 预期 | 产品现状 | 判定 |
|---|---|---|---|
| PRD UF-7·默认收起轨道归零 | 收起 0px 不可聚焦 | width 0 + visibility hidden，e2e computed 断言绿 | ✅ |
| PRD UF-7·三态 | collapsed/expanded/hidden | dockTrackMode 纯函数 + e2e 断言 | ✅ |
| PRD UF-7·知识视图强制隐藏/切回恢复 | 已开也隐藏、恢复原态 | view-state 转移表 + 11 用例 + e2e L8-L12 | ✅ |
| PRD UF-7·页签跟随项目 | 可见集 = 当前项目 + 全局 | visibleDockTabs/resolveActiveDock + 8 用例 | ✅（机制；实机按项目驱动 = M2 域页签登记后，PRD P1 机制最简版口径内） |
| PRD·P1 页签内容以占位为主 | 占位 | 全局「开始」单页签 + 内容占位 | ✅ 符合 P1 口径（原型开始页入口卡 = M2，SMOKE-LEDGER L598-605 记账） |
| tech-design·页签条 = 官方 SegmentedTabs | 官方件 | SegmentedTabs | ✅ 按设计（原型 chips 形态不采纳——dsh 底子） |
| 原型 NFR·strip 形态 | 内衬 10px/8px、分区（chips 区 + 尾部控制） | gap:0/padding:0、tabs 与收展钮左缘挤排 | ❌ fix-4 |
| 原型 NFR·宽度可拖拽 | 300–70vw + 8px col-resize 手柄 | 固定 340 无手柄 | ❌ fix-4 |
| 原型 NFR·body 内衬 | 4px/16px/20px | 无内衬，占位贴边 | ❌ fix-4 |

**结论：dock 机制面（UF-7 全部 Validation）符合 P1 预期；视觉/形态面三处偏差已由 fix-4 承载（官方件保留 + 原型布局刻度），无需新任务。** 走查截图对照：[p3-dock-expanded.png](./shots/p3-dock-expanded.png) × [r3-dock-expanded.png](./shots/r3-dock-expanded.png)。

### 6.3 任务台账（累计）

fix-2 / fix-3 / fix-4 / fix-5 / **fix-6** 五件 pending（P1×4 + P2×1）；index.json 52 任务验证通过。建议执行序：fix-3 → fix-5 → fix-2 → fix-6 → fix-4。

## 7. 第 5 轮 · P1 UI 全面排查（2026-10-03 · walk4 全流程走查 + fix-2/3/4 完成态实测）

> 并行会话已于 01:06–02:03 完成 fix-2/3/4（记录在案）。本轮 = 全面矩阵排查：fix 完成态实测 + 全部未测面第一手补测（walk4，13 步 11 PASS）+ 已知缺陷现状确认。

### 7.1 fix 完成态实测结论

| 任务 | 完成态实测 | 判定 |
|---|---|---|
| fix-2 标题栏（WCO） | walk4-H3 间接实证：strip 右让位 137.6px = `env(titlebar-area-width)` 生效（WCO 激活） | ✅ 修实 |
| **fix-3 模态裁切** | georecheck 复测：**卡片仍 380px，未落 className 挂点**——浏览器相位内容 680 左裁 **300px**（较修前 180 加剧），表单 `labelVisible:false` 不变。执行偏走任务规格（宽度仍在内容层），几何断言 AC 未落 → **回炉 fix-7（P0）** | ❌ 未修且加剧 |
| fix-4 dock 视觉 | walk4-H：strip 内衬 4/137.6/8 + gap 8、手柄在场（separator/vertical）、body 内衬 4/16/20、bg-base、tabs fit-content | ✅ 修实；键盘步进 ⚠️（见 fix-8②） |

### 7.2 walk4 补测通过面（首手验证）

取消点干净退出（浏览器相位 Esc 无副作用）／浏览改选③（浏览…选知识库目录→回填）／重选联动④（未手改字段重构、浏览选定保留）／非法路径拦截（issue + 确认禁用→修复解禁）／注册成功→会话相位+项目行+「暂无会话」占位／对话 tab 官方会话面在场／**多层域树**（二级「前端/组件」+ 三级「a/b/c」节点在场，第 4 层拒收不入索引——UF-6 域 ≤3 层契约首手验证）／UF-5 往返数据保持（域过滤经 session 往返卡片仍过滤）／官方壳承继面在场探针（收展钮×2/设置/品牌行/新会话×2）。

### 7.3 新发现（→ fix-8，P2 打包）

① **域树激活标记往返丢失**：往返后过滤数据保持（3 条正确）但域行 `data-active` 标记消失——数据/视觉不同步；② dock 手柄键盘步进未生效（341→341）——源码接线齐全，焦点/全局键盘拦截待复核定性。

### 7.4 已知缺陷现状确认

fix-5（关键词弹回+网格消失）与 fix-6（侧栏搜索/视图选项钮缺）表现与立案一致（仍 pending，walk4-K/K2）。

### 7.5 P1 UI 实现矩阵（终版）

| UI Function | 实现度 | 缺陷载体 |
|---|---|---|
| UF-1 左栏 | 🟡 ~92% | 结构/四态/承继面/行语言全 ✅；搜索+视图选项钮缺 = fix-6 |
| UF-2 hero | ✅ 100% | —（含取消点干净退出） |
| UF-3 两段式 | 🟡 功能 100% / 可用性受阻 | 全部交互链 ✅（回填/改选③/联动④/拦截/取消点/执行/反馈）；**模态视觉裁切 = fix-7（P0，label 不可见）** |
| UF-4 会话面板 | 🟡 ~90% | 三 tab/keep-alive/对话官方面/召回空态+真数据 ✅；轨迹 tab 数据未接线（2.12 残留②，未立案）；关键词缺陷归 UF-6 面 |
| UF-5 视图互换 | ✅ ~97% | 机制全 ✅；往返域树激活标记丢失 = fix-8① |
| UF-6 知识浏览 | 🟡 ~85% | 索引/多层域树/域过滤/抽屉/空态/静默重建 ✅；**关键词交互 = fix-5（P1）** |
| UF-7 dock | ✅ ~95% | 机制全 + fix-4 视觉修实 ✅；键盘步进复核 = fix-8② |
| 窗口形态 | ✅ | fix-2 WCO 修实 ✅ |

### 7.6 任务台账（本轮后）

**pending：fix-5（P1）/ fix-6（P1）/ fix-7（P0 回炉）/ fix-8（P2）**；fix-2/3/4 completed（fix-3 经实测回炉）。执行序建议：**fix-7 → fix-5 → fix-6 → fix-8**。测试管线（gen-journeys/eval/gen-contracts/eval 已提交）继续并行推进。

## 8. 第 6 轮补录（2026-10-03 · 走查人复报：会话面板顶部 toolbar）

### 8.1 中区会话面板缺顶部 toolbar → **fix-9 新立（P1）**

走查人指出「中间的对话面板上方要有 toolbar，对齐 dsh 的布局」。三方证据闭合：原型 conv-header 两行结构（标题行 conv-crumbs/conv-actions/conv-utils + 三页签行，[index.html:103-125](../../../proposals/dsh-forge-redesign/prototype/index.html)）；官方骨架有现成槽位体系（S2 清点：`conversation.session.header` + `.lineage/.actions/.utilities/.corner`）；产品只做了三页签行与孤位角位钮，**整条标题行未实现**。fix-9 = 官方槽位承载（会话标题 lineage + utilities 两钮[面板 toggle 归位 + 编辑器打开占位] + hero 让位 + WCO 核查）。

### 8.2 UF-4 实现度修正

§7.5 矩阵 UF-4 行更新：🟡 ~90% → **🟡 ~80%**（新增 toolbar 缺失载体 fix-9；原「轨迹 tab 未接线」不变）。

### 8.3 任务台账（累计）

pending：**fix-7（P0）/ fix-5（P1）/ fix-6（P1）/ fix-9（P1）/ fix-8（P2）**；index.json 55 任务验证通过。执行序建议：**fix-7 → fix-5 → fix-9 → fix-6 → fix-8**。

## 9. 第 7 轮补录（2026-10-03 · 走查人裁决：dock 全面对齐 dsh）

### 9.1 官方 ui-dockkit 基座替换 → **fix-10 新立（P1，取代 fix-4 路线）**

走查人裁决「dockkit 要完全对齐 dsh，在官方的基础上添加 dsh-forge 的内容」。契约勘面（S2 §2.5 + 细读）：官方 kit = 完整停靠引擎——`DockController`+可逆操作、`DockSurface`/`DockLayout`（chips 页签条/分栏/拖放/添加关闭控件/`chrome` 角位槽）、`FloatLayer` 浮动、`createInitialState` 原生 collapsed 初始态、「展开收起不累积副本」官方语义。fix-10 = 基座整体替换自研轨道（strip/手柄/宽度态退役），dsh-forge 只叠内容（`renderTab` 按 kind 分发 + labels 中文化 + chrome 收展钮）；UF-7 三态/跟随语义经映射层零变化。**fix-4 记录保留为过程资产（路线被取代）；fix-8② 随基座替换 moot**（官方引擎自有键盘/手势面）。

### 9.2 任务台账（累计）

pending：**fix-7（P0）/ fix-5（P1）/ fix-9（P1）/ fix-10（P1）/ fix-6（P1）/ fix-8（P2，仅剩①域树标记项）**；index.json 56 任务验证通过。执行序建议：**fix-7 → fix-5 → fix-10 → fix-9 → fix-6 → fix-8①**。
