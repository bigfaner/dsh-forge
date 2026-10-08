---
feature: "dsh-forge-m3-bootstrap-presets"
generated: "2026-10-08"
status: draft
---

# Business Rules: dsh-forge M3 自举·模式预设（双预设 + 拆包 + 技能迁移 + 提案管线消费）

> 来源：prd-spec.md（9 SC / 五流程 / Data Requirements）+ prd-user-stories.md（9 stories）。
> 非交互模式：全部 [CROSS] 项自动集成（review-choices.md 记录）。

## 容器归属与成链

### BIZ-001: 归属模型与容器双轨（feature ⊂ 提案、任务 ⊂ 提案）

**Rule**: 任务恒挂容器——`tasks.source_kind`（CHECK feature|proposal）+ `source_id` 通用源头双列（多态引用无 DB FK，引用完整性 = 服务不变量：写入时校验容器在场、source_id 必命中 source_kind 对应表）；`tasks.slug ≡ 容器 slug`（feature/proposal 同规）；同容器边约束 = task_edges 两端 task 的 source_id 相等；突击任务直挂提案（无 feature 行/文档域），远征任务挂 feature=提案链。
**Context**: 部分提案只有任务、其余有 feature 也有任务（2026-10-07 模型澄清）；突击无 feature 阶段（用户裁决）。
**Scope**: [CROSS]
**Source**: prd-spec §Other Notes·Data Requirements（归属模型约束）/ tech-design §Data Models 不变量①②

### BIZ-002: 成链分叉（远征单步成链 / 突击直接任务阶段）

**Rule**: transitionProposal(toStatus=accepted) 服务内聚分叉——mode=expedition ∧ 无同 proposal_id feature → 单事务原子成链（proposals 行 + features 行[同名 slug/title/summary 继承/proposal_id 谱系] + feature_records(register) 审计行，全成全败）；mode=blitz → 不成链、直接进入任务阶段（任务直挂提案）；mode=NULL（扫描吸收旧提案）→ 不成链（先 setProposalMode 定模式，补链 = 显式 registerFeature）。
**Context**: 「单步成链」原子 + 双面同门天然成立（§6-28 登记即推进同构）；突击只有提案与任务（用户裁决 2026-10-07）。
**Scope**: [CROSS]
**Source**: prd-spec §Goals SC6·§Flow Description 流程二/三 / tech-design §Interface 1·图 6

### BIZ-003: mode 溯源与快照不回溯

**Rule**: 提案 mode 溯源（expedition/blitz）由创建技能在 createProposal 时写入（proposals.mode 列；扫描吸收旧提案 = NULL 缺省占位）；tasks.mode = 创建时快照——setProposalMode 单事务只写 proposals.mode、永不触碰 tasks.mode（既有任务 localId 形态/eval 门豁免/派发模板不回溯）；features 恒远征无 mode 列（成链门保证：accepted ∧ mode=expedition 才成链）；mode 人工变更唯一正门 = 提案子 tab setProposalMode（reason 必填），agent tool 面无模式改写动词（契约断言）。
**Context**: 会话节奏 ≠ 功能溯源、确认门 ≠ 模式两处解耦的机械锚（tech-design 裁决⑥）。
**Scope**: [CROSS]
**Source**: prd-spec §Goals SC3·§Flow Description 流程五 / tech-design §Data Models 不变量③·图 7

### BIZ-004: 模式绑定三律（会话与模式解耦）

**Rule**: 律一（自动对齐）= 经提案/feature 行头「打开新会话」绑定入口创建的 blank 会话自动对齐目标模式（提案渠道 = 提案 mode·无溯源不切换；feature 渠道 = 固定远征），现状上下文预填消息输入框不自动发送；律二（确立后不可切换）= 首回合后平台 blank 锁生效（座位不可切换——平台边界如实记账）；律三（唯一变更通道）= mode 人工变更只经提案子 tab，变更后新会话对齐新值、既有任务快照不变；hero 自由创建的会话不自动对齐——错配守卫 = mode chip 对照 + 派发入口提示（可见性而非阻断）。
**Context**: 防逐会话手选错档；平台 blank 锁边界不伪装可切换。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ②·§Flow Description 流程一 / prd-user-stories Story 1·Story 4A

### BIZ-005: L1 物理边界（模式边界靠机制不靠提示词）

**Rule**: 突击预设组合物理不含规格技能（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks——技能枚举断言）；远征全量可见；核心包技能目录无 git-commit / git-checkout 条目；边界靠装载组合物理隔离，不靠提示词叮嘱。
**Context**: 模式边界机制化——升级 dsh 不悄悄破边界（spike S6-3 实证同构边界）。
**Scope**: [CROSS]
**Source**: prd-spec §Goals SC2·§In Scope ① / prd-user-stories Story 6

### BIZ-006: 提案五态流转、双面同门与谱系取代链

**Rule**: 提案五态封闭（draft/under-review/accepted/rejected/superseded）；UI 人工裁决（RPC forge:proposals/transition）与 agent 面 transitionProposal tool 双面写库一致（同门动词）；superseded 转移必带 supersededBy（目标提案在场校验 → proposals.superseded_by 自引用列）；提案文档读面 = listProposalDocs 只读目录扫描（docs/proposals/<slug>/ 全部 .md，零状态零写径、文件系统为事实源）。
**Context**: 评审工作流有家；谱系三成分（proposal_id 谱系 + 取代链 + mode 溯源）数据面完整（评审缺口 #1/#5 处置）。
**Scope**: [CROSS]
**Source**: prd-spec §Goals SC6 / tech-design §Interface 1·Interface 4

## 提交门与审计

### BIZ-007: submitTask AC/测试证据与 gate 摘要双门

**Rule**: 带 AC 任务（ac_json 非空）submit 时 gate.test !== true → 拒绝（ERR_TEST_EVIDENCE_REQUIRED，错误信息逐行含 AC 清单）；type=gate 任务缺数字摘要 → 拒绝（ERR_GATE_SUMMARY_REQUIRED）；通过后转移 + record（gate_json/commit_hash）；提交定式 = submit 记录含 commit_hash 且提交信息符合 Conventional Commits（配置 AGENTS.md 时从其约定、缺省回退模型常识——两态分别断言）。
**Context**: 自举开发的每一步都有质检环（db-schema §6-24/§6-31 兑付）。
**Scope**: [CROSS]
**Source**: prd-spec §Goals SC7·§Flow Description 流程四 6 / prd-user-stories Story 7

### BIZ-008: feature 域每动词审计伴随（feature_records）

**Rule**: feature 域全部动词（registerFeature / transitionFeature / upsertFeatureDoc / 成链内聚）每次写入伴随 feature_records 审计行（verb = 事件名 TS 单源、actor 三值 CHECK = plugin-tool/ui/core、前后态）；append-only 双触发器机械防线（UPDATE/DELETE 直接 ABORT）——与 task_records 同构。
**Context**: 「每次写自动审计」扩展到 feature 域（SC6 表断言对象）。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ③·§Data Requirements DF005 / tech-design §Data Models

## worker 授权与派发纪律

### BIZ-009: worker 授权收窄与逃生通道

**Rule**: 一切 worker 全局拒绝交互/委派/待办/呈现四语义族（ask-user / delegation / todo / present——实名表见 conventions/task-domain TECH-task-006）；worker 的 forge 工具面 = submitTask + addTask 恰两动词（claimTask/queryTask/dispatchTask 不入 worker 面）；skill 不拒（组合继承目录按需加载）；worker 遇重大问题经 addTask 逃生通道——前缀按语义二分：disc-N（独立问题，不阻塞源任务）/ fix-N（走 fix 链协议：block_source 单事务、链深 ≤6、恢复钩子——M2 机制回归），自身任务以 blocked 收尾并引用新任务。
**Context**: worker 既能干活又不越权（不问用户、不派生子代）；受阻上报径完整。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ①·§Flow Description 流程四 5 / prd-user-stories Story 5

### BIZ-010: 派发仅按 DAG 就绪序——无单任务直接执行入口

**Rule**: 任务派发只支持按 DAG 依赖顺序领取就绪任务（dispatchTask 就绪选择机械序）；UI 与 tool 面同语义——无指定单个任务直接执行的入口（用户裁决 2026-10-08 v22）；派发指令只携带容器标识（「/run-tasks <容器标识>」单行最小消息——dispatchTask 唯一必要参数 = contextSlug）。
**Context**: 消灭跳序执行旁路；派发入口两途（工具栏按钮/会话内 run-tasks）汇入同一 dispatcher 循环。
**Scope**: [CROSS]
**Source**: prd-spec §In Scope ②·§Flow Description 流程四 1 / prd-user-stories Story 4A

## 产品纪律

### BIZ-011: 自举纪律（M4 起自身开发）

**Rule**: M4 起剩余功能一律用 dsh-forge 自身开发（SC-M3 门 = M3.5 作为首个自举 feature 端到端走查：评审接受 → 成链 → 远征会话派发开发 → 任务/记录 100% 入自身 forge.db → 全景可见）；全程零 manifest.md 生成（无会话时代的补偿物 = 第二事实源，消亡论证同族适用于显式「当前容器」状态文件）。
**Context**: 总纲自举纪律从纸面变现实；飞轮第一批真实数据入库。
**Scope**: [CROSS]
**Source**: prd-spec §What ④·§Goals SC8 / prd-user-stories Story 8 / tech-design §老 forge state.json 形态对应

## LOCAL 项（留在 feature 内）

- hero 开关首启预置数据初始化细则与行所有权分叉 → tech-specs TECH-004（技术形态承载）
- 派发入口 UI v22 语义（跳转/新开双路由、全终态置灰、执行中在场跳转不重发）→ feature ui-functions/ui-design 已载
- 「打开新会话」预填不自动发送 + autosend 例外成员（诊断两路 + 派发指令）→ feature ui-functions 已载
- Forge设置三段表单（Provider/Model/Reasoning 去 Output 上限）与未配置态占位 → feature ui-functions 已载
- 诊断 toast 形态（1s/5s 自消、「发送给 agent」）→ feature ui-design 已载
