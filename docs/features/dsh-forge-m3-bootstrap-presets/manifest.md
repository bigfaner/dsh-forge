---
feature: "dsh-forge-m3-bootstrap-presets"
created: "2026-10-07"
status: design
---

# Feature: dsh-forge-m3-bootstrap-presets

<!-- Status flow: prd → design → tasks → in-progress → completed -->

## Documents

| Document | Path | Summary |
|----------|------|---------|
| PRD Spec | prd/prd-spec.md | M3 四交付面（预设基座+拆包+技能迁移 / 提案消费+模式绑定三律 / 规格域 gate / 自举走查 SC-M3 门）；9 项 SC 验收；spike S5/S6 dev 全绿内化；**UI 评审裁决（2026-10-07，v2–v18）全量回写**——核心语义：突击无 feature 阶段（只有提案与任务，远征成链专属）、Forge设置三项、诊断 toast + 发送给 agent、「打开新会话」预填上下文不自动发送；**tech-design 裁决回写（2026-10-08）：SC3 溯源口径 + feature_records v1 直改（drift #6/#7）；UI 裁决 v22 回写：In Scope ② 派发入口 + 流程四入口两途（claimTask 措辞 → dispatchTask 对齐）** |
| User Stories | prd/prd-user-stories.md | 9 stories：模式选择与自动对齐 / 突击直达链（**直接任务阶段·无 feature**）/ 远征全链 / 提案评审与 mode 升降级（快照不回溯）/ **打开新会话带上现状（4A：预填不发送 + feature 固定远征 + 诊断/派发自动发送例外 + 派发跳转/新开双路由 + 无单任务执行入口）** / worker 供给收窄+默认 LLM / 规格技能物理隔离 / gate 兜底与提交定式 / 自举走查（M3.5·零 manifest） |
| UI Functions | prd/prd-ui-functions.md | 4 UF + **数据约束**（归属模型：feature ⊂ 提案、任务 ⊂ 提案·同名成链/突击直挂；容器/标识/@path/模式路由/派发入口语义）+ **核心交互流程图** ×3（打开新会话预填·诊断两路·派发入口）+ **消息体示例** ×5（预填草稿 / 任务失败诊断[远征|突击] / feature 子图诊断 / **派发指令[「/run-tasks 容器标识」单行最小消息·v23]**）——hero 座位 = 平台 UI 仅开关开启；概览 tab 默认 560px 可拖拽 |
| UI Design | ui/ui-design.md | v24 = 二十四轮用户评审修订全记录（㊵ 条裁决：… → 任务子 tab 工具栏重构[视图下拉+派发/诊断固定右端] + 派发按钮[跳转/新开+自动发送·全终态置灰] + 无单任务直接执行 → 派发指令最小化[/run-tasks + 容器标识单行] → **派发按钮视觉收敛[可点击同款式·置灰深灰实底]**）；170 断言全绿；**用户裁决 2026-10-08（v22–v24）** |
| Prototype | ui/prototype/ | index.html / styles.css / app.js / data.js / smoke.cjs / README——**冒烟 170 断言全绿**（playwright chromium → 系统 Chrome → Edge 候选链） |
| Tech Design | design/tech-design.md | **十一项用户裁决（2026-10-07/08·逐项对齐 tech-design ①–⑪）**：①dispatchTask 复合动词（claim+spawn 合并·简报零进模型上下文）②transitionFeature 收窄不进 tool 面 ③tasks v1 直改（未上线零迁移）④source_kind+source_id 通用源头双列 ⑤成链 = transitionProposal 服务内聚 ⑥features 恒远征无 mode 列 ⑦main_session 砍除 ⑧事件驱动 logs/{slug}.jsonl（容器维度·两层抽象·自建总线）⑨tool 返回双友好文本 ⑩dispatchPrompt 三层存放 ⑪spawn 失败机械防线 + 池快照现状感知；**四路评审处置（2026-10-08：矛盾/完整/术语/协同，38 项）**——读面补齐（listProposalDocs 扫描 / features.listDocs 通道 / listProposals.taskCount / taskStats.unmetPending）+ 谱系取代链（superseded_by 列）+ PRD 回写四处（drift #6/#7）；drift 记账 8 项；**关键逻辑流程图 ×13**（装配 boot 序 / 派发泳道 / spawn 防线 / worker 供给 / 事件日志 / 成链分叉 / mode 快照 / submit 校验链 / 打开新会话 / 诊断两路 / 设置单门 / 双模式全景 / **派发入口[跳转/新开双路由·UI 裁决 v22]**）；autosend 例外成员 = 诊断两路 + 派发指令（Interface 5 / OQ#1 增跳转缝） |
| ER Diagram | design/er-diagram.md | 八域表终态（+feature_records；proposals+mode；tasks 源头双列+mode+ac_json）；不变量六条；v1 直改无迁移注记 |
| SQL Schema | design/schema.sql | forge.db 终态 DDL（与 migrations.ts pin 同步；差异 5 项对 M2） |
| Page Map | design/page-map.md | 概览三子 tab 升级（UF-1/3/4）+ Forge设置 分区（UF-2·settings.section slot）+ 评审/模式两对话框 + hero 座位开关首启预置 + openSessionWithPreset 组合子；无新路由 |
| Proposal | ../../proposals/dsh-forge-m3-bootstrap-presets/proposal.md | 里程碑提案（全部裁决出处）：主轴 = 自举达成、双预设核心承载；拆包管线/规格轴；执行面知识分层；**成链分叉（远征成链 / 突击直接任务——UI 评审裁决）**；追溯矩阵→M3.75（#13）；Out of Scope #1–#13 全量顺延表 |
| Spikes | ../../proposals/dsh-forge-m3-bootstrap-presets/spikes/ | S5/S6 实跑证据文档（dev 全绿 + 环境注记 + 方法论沉淀）；工件 `spikes/m3-s5-s6-presets/`（overlay 生成器 / m3_probe 探针 / playwright spec） |

## Traceability

> PRD 阶段追溯（design/tasks 产出后扩展）。**design 追加（2026-10-08）**：SC↔设计落位全映射见 [design/tech-design.md §PRD Coverage Map](../design/tech-design.md)。

| PRD Section | Stories | UI | Notes |
|-------------|---------|-----|-------|
| SC1 双预设可用与平台语义 | Story 1 | hero 座位（平台 UI·开关开启）+ ui-design §hero 预设座位 | 断言基 UI 投影面（spike 口径）；自动对齐经「打开新会话」入口 + select RPC |
| SC2 L1 物理边界（双层） | Story 5 / Story 6 | — | 预设层 = 技能枚举断言；worker 层 = toolFilter + 组合继承 + 按需加载 + Forge设置 LLM 一致（配置面三项） |
| SC3 mode 溯源解耦 | Story 4 | UF-1 mode chip（ui-design §UF-1/流程 2） | 创建技能写入；人工变更快照不回溯 |
| SC4 突击直达链 | Story 2 | — | quick-tasks → **直接任务阶段（无 feature 行）** → 派发 → 即时刷新 |
| SC5 远征全链 | Story 3 | — | 全程 tool 读写；四域全景一致；成链 = 远征专属 |
| SC6 提案五态流转与单步成链 | Story 4 / Story 2 | UF-1（ui-design §UF-1 + 流程 1） | 双面同门；**成链分叉**（远征成链 / 突击直接任务）；feature_records 表断言 |
| SC7 规格域 gate 与提交定式 | Story 7 | — | AC 拒绝含清单；gate_json；AGENTS.md 两态 |
| SC8 自举走查（SC-M3 门） | Story 8 | — | M3.5 走查；零 manifest.md；总纲 SC2/SC3/SC7 回归 |
| SC9 记账合入 | Story 8 | — | 顺延表 #1–#13 + 总纲回写四条款 |
| 打开新会话带上现状 | Story 4A | UF-1/UF-4 + ui-design §元数据布局 | 预填不发送；@path 第一行；feature 固定远征；诊断两路 + 派发指令 = 自动发送例外（v22 扩容）；派发执行中在场 = 跳转既有会话不重发 |
| UF-2 Forge设置 | Story 5 | ui-design §UF-2 + 流程 4 | 多小节结构；worker 三项；agentOptions 携带优先 |
| UF-3 诊断 + 派发 | Story 4A | ui-design §UF-3 + 流程 5/6 | 任务子 tab · 容器 pill 语境；toast（1s/5s）+ 发送给 agent；只读零副作用；**派发按钮（v22：未终态亮起/全终态置灰·跳转/新开+自动发送·无单任务执行入口）；视图下拉 + 派发/诊断固定右端** |
| UF-4 feature 子 tab | Story 4A | ui-design §UF-4 | 阶段过滤；两列元数据（标识/模式/谱系/阶段）；分层文档（中文分组 + 真实路径）；打开新会话→远征 |
