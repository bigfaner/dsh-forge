---
feature: "dsh-forge-m3-bootstrap-presets"
created: "2026-10-07"
status: tasks
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
| Tasks | tasks/ | **breakdown-tasks 落盘（2026-10-08）**：29 业务任务五阶段（①契约与数据面 2 → ②core 服务域 7 → ③插件两包与宿主 9 → ④web UI 7 → ⑤质量门与走查 4）+ 阶段门/summary/测试任务自动生成——index.json 47 项 `forge task validate` 全绿；phase-inventory.json 阶段溯源（design×4 + PRD-explicit×1）；breaking ×5（1.1 契约签名 / 1.2 schema 直改 / 2.4·2.5 容器化 / 3.5 tool 面收口——各带 Test Impact）；doc ×3（3.2/3.6 技能文本 / 5.4 记账合入） |
| Proposal | ../../proposals/dsh-forge-m3-bootstrap-presets/proposal.md | 里程碑提案（全部裁决出处）：主轴 = 自举达成、双预设核心承载；拆包管线/规格轴；执行面知识分层；**成链分叉（远征成链 / 突击直接任务——UI 评审裁决）**；追溯矩阵→M3.75（#13）；Out of Scope #1–#13 全量顺延表 |
| Spikes | ../../proposals/dsh-forge-m3-bootstrap-presets/spikes/ | S5/S6 实跑证据文档（dev 全绿 + 环境注记 + 方法论沉淀）；工件 `spikes/m3-s5-s6-presets/`（overlay 生成器 / m3_probe 探针 / playwright spec） |

## Traceability

> tasks 阶段五列追溯（2026-10-08 breakdown-tasks 落盘）。SC↔设计落位全映射见 [design/tech-design.md §PRD Coverage Map](../design/tech-design.md)；阶段结构见 [tasks/phase-inventory.json](./tasks/phase-inventory.json)。

| PRD Section | Design Section | UI Component | Placement | Tasks |
|-------------|----------------|--------------|-----------|-------|
| SC1 双预设可用与平台语义 | Interface 5 预设装配 + 图 1 boot 序 | hero 座位（平台 UI·开关开启） | existing-page:中区 hero（平台面） | 3.7, 3.9, 5.2 |
| SC2 L1 物理边界（双层） | Layer Placement 拆包 + Interface 2 收窄矩阵 + 契约 pin #19/#20 | — | — | 3.1, 3.2, 3.4, 3.7, 5.1, 5.2（按需加载探针 = 3.9） |
| SC3 mode 溯源解耦 | Interface 1 proposals/tasks mode + 图 7 快照不回溯 | UF-1 mode chip | existing-page:概览·提案子 tab | 2.2, 2.4, 4.2, 4.6, 5.2 |
| SC4 突击直达链 | 图 6 成链分叉 + 图 12 + source 双列（Data Models） | UF-3 容器 pill 双轨 | existing-page:概览·任务子 tab | 1.2, 2.2, 2.4, 3.6（quick-tasks）, 4.4, 4.6, 5.2 |
| SC5 远征全链 | Interface 1 forgeFeatures + Layer Placement 技能迁移 | UF-4 分层文档 | existing-page:概览·feature 子 tab | 2.1, 2.3, 3.1, 3.2, 4.3, 4.6, 5.2 |
| SC6 提案五态流转与单步成链 | 图 6 + feature_records（Data Models）+ Interface 4 双面 | UF-1 五态 chips + 裁决/模式对话框 | existing-page:概览·提案子 tab | 2.1, 2.2, 2.3, 4.2, 4.6, 5.2 |
| SC7 规格域 gate 与提交定式 | 图 8 submitTask 校验链 + Interface 6 错误码 | — | — | 2.6, 3.6, 5.2 |
| SC8 自举走查（SC-M3 门） | Testing Strategy dogfood 行 | — | — | 5.3（5.2 回归前置） |
| SC9 记账合入 | PRD Coverage Map SC9 行（执行期文档任务） | — | — | 5.4 |
| Story 4A 打开新会话 + 诊断 + 派发 | Interface 5 + 图 9/10/13 + Integration #3/#5 | UF-1/UF-4 行头按钮 + UF-3 诊断/派发 | existing-page:概览三子 tab | 4.1, 4.2, 4.4, 4.6, 5.2 |
| UF-2 Forge设置 | 图 11 设置单门 + Integration #4 | UF-2 Forge设置 分区 | existing-page:设置对话框（settings.section slot） | 2.7, 3.8, 4.5, 4.7 |
| 契约与数据面地基 | Interfaces 全域 + Data Models 差异总表 | — | — | 1.1, 1.2 |
| 阶段门（G-schema/G-core/G-plugin-host/G-web/SC-M3） | phase-inventory.json gates | — | — | 1.gate–5.gate（forge task index 自动生成） |
