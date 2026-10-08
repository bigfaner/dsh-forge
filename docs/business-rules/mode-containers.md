---
title: "模式与容器规则"
domains: [mode, container, proposal, chaining, snapshot]
---

# 模式与容器规则

> M3 起的提案/任务容器域不变量：归属模型与容器双轨、成链分叉、mode 溯源与快照不回溯、会话模式绑定三律、L1 物理边界、提案五态与谱系。

## 容器归属与成链

### BIZ-mode-001: 归属模型与容器双轨（feature ⊂ 提案、任务 ⊂ 提案）

**Rule**: 任务恒挂容器——`tasks.source_kind`（CHECK feature|proposal）+ `source_id` 通用源头双列（多态引用无 DB FK，引用完整性 = 服务不变量：写入时校验容器在场、source_id 必命中 source_kind 对应表）；`tasks.slug ≡ 容器 slug`（feature/proposal 同规）；同容器边约束 = task_edges 两端 task 的 source_id 相等；突击任务直挂提案（无 feature 行/文档域），远征任务挂 feature=提案链。
**Context**: 部分提案只有任务、其余有 feature 也有任务（2026-10-07 模型澄清）；突击无 feature 阶段（用户裁决 2026-10-07）。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-001（prd-spec §Data Requirements 归属模型约束 / tech-design §Data Models 不变量①②）

### BIZ-mode-002: 成链分叉（远征单步成链 / 突击直接任务阶段）

**Rule**: transitionProposal(toStatus=accepted) 服务内聚分叉——mode=expedition ∧ 无同 proposal_id feature → 单事务原子成链（proposals 行 + features 行[同名 slug/title/summary 继承/proposal_id 谱系] + feature_records(register) 审计行，全成全败）；mode=blitz → 不成链、直接进入任务阶段（任务直挂提案）；mode=NULL（扫描吸收旧提案）→ 不成链（先 setProposalMode 定模式，补链 = 显式 registerFeature）。
**Context**: 「单步成链」原子 + 双面同门天然成立（§6-28 登记即推进同构）；突击只有提案与任务（用户裁决 2026-10-07）。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-002（prd-spec §Goals SC6·§Flow Description 流程二/三 / tech-design §Interface 1·图 6）

### BIZ-mode-003: mode 溯源与快照不回溯

**Rule**: 提案 mode 溯源（expedition/blitz）由创建技能在 createProposal 时写入（proposals.mode 列；扫描吸收旧提案 = NULL 缺省占位）；tasks.mode = 创建时快照——setProposalMode 单事务只写 proposals.mode、永不触碰 tasks.mode（既有任务 localId 形态/eval 门豁免/派发模板不回溯）；features 恒远征无 mode 列（成链门保证：accepted ∧ mode=expedition 才成链）；mode 人工变更唯一正门 = 提案子 tab setProposalMode（reason 必填），agent tool 面无模式改写动词（契约断言）。
**Context**: 会话节奏 ≠ 功能溯源、确认门 ≠ 模式两处解耦的机械锚（tech-design 裁决⑥ 2026-10-08）。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-003（prd-spec §Goals SC3·§Flow Description 流程五 / tech-design §Data Models 不变量③·图 7）

## 会话与模式

### BIZ-mode-004: 模式绑定三律（会话与模式解耦）

**Rule**: 律一（自动对齐）= 经提案/feature 行头「打开新会话」绑定入口创建的 blank 会话自动对齐目标模式（提案渠道 = 提案 mode·无溯源不切换；feature 渠道 = 固定远征），现状上下文预填消息输入框不自动发送；律二（确立后不可切换）= 首回合后平台 blank 锁生效（座位不可切换——平台边界如实记账）；律三（唯一变更通道）= mode 人工变更只经提案子 tab，变更后新会话对齐新值、既有任务快照不变；hero 自由创建的会话不自动对齐——错配守卫 = mode chip 对照 + 派发入口提示（可见性而非阻断）。
**Context**: 防逐会话手选错档；平台 blank 锁边界不伪装可切换。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-004（prd-spec §In Scope ②·§Flow Description 流程一 / prd-user-stories Story 1·Story 4A）

### BIZ-mode-005: L1 物理边界（模式边界靠机制不靠提示词）

**Rule**: 突击预设组合物理不含规格技能（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks——技能枚举断言）；远征全量可见；核心包技能目录无 git-commit / git-checkout 条目；边界靠装载组合物理隔离，不靠提示词叮嘱。
**Context**: 模式边界机制化——升级 dsh 不悄悄破边界（spike S6-3 实证同构边界）；装配技术形态见 conventions/preset-assembly.md TECH-preset-001。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-005（prd-spec §Goals SC2·§In Scope ① / prd-user-stories Story 6）

## 提案生命周期

### BIZ-mode-006: 提案五态流转、双面同门与谱系取代链

**Rule**: 提案五态封闭（draft/under-review/accepted/rejected/superseded）；UI 人工裁决（RPC forge:proposals/transition）与 agent 面 transitionProposal tool 双面写库一致（同门动词）；superseded 转移必带 supersededBy（目标提案在场校验 → proposals.superseded_by 自引用列）；提案文档读面 = listProposalDocs 只读目录扫描（docs/proposals/<slug>/ 全部 .md，零状态零写径、文件系统为事实源）。
**Context**: 评审工作流有家；谱系三成分（proposal_id 谱系 + 取代链 + mode 溯源）数据面完整（tech-design 评审缺口 #1/#5 处置）。
**Source**: feature/dsh-forge-m3-bootstrap-presets BIZ-006（prd-spec §Goals SC6 / tech-design §Interface 1·Interface 4）
