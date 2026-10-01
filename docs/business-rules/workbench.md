---
title: "工作台业务规则(项目三分模型 · 单激活 · 会话挂接 · 时效基线 · 单向投影 · subagent 反查 · 布局记忆 · 拆出窗口)"
domains: [project-registration, identity-resolution, doc-placement, session-link, prompt-injection, freshness-baseline, single-active, workspace-projection, archive-semantics, subagent-lineage, task-session-binding, executing-state, layout-memory, detached-windows]
---

# 工作台业务规则(项目三分模型 · 单激活 · 会话挂接 · 时效基线 · 单向投影 · subagent 反查 · 布局记忆 · 拆出窗口)

> **编号对账注记(2026-10-01,M4 执行期 consolidate-specs)**:M4 规划期入库的投影/subagent 反查/执行中三条曾误复用 006/007/008(与 M3 Stage Gating/偏好条目撞号,违反文件内 max+1 序规则),已修复为 **BIZ-workbench-010/011/012**;M3 条目 006/007/008 原号不动。M4 期 feature 文档与源码注释中「BIZ-workbench-006/007/008」指投影/subagent/执行中三条者,按此映射读作 010/011/012(历史文档逐字保留,不回写)。

## Project Registration

### BIZ-workbench-001: 项目三分模型与工作台自有状态

**Rule**: forge 项目注册采用三分模型——①代码根目录;②工作台自有状态(项目注册表/挂接索引/视图状态,独立存放,不与 forge 数据混放);③过程文档位置(仓内默认 / 仓外本地路径可选)。仓外文档默认关闭,须注册向导显式选择并显式授权(授权登记持久化于自有状态,校验链只读登记,无入参旗标绕过通道);移除注册仅级联清除快照/挂接等自有数据,不触碰项目仓内文件与 forge 数据。
**Context**: 过程资产可不入代码仓与数据所有权隔离(PRD 存储约束/DF005)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-001(prd/prd-spec.md §In Scope/§G5/DF005;design/tech-design.md §Interface 1/§Data Models)

**M3 修订(2026-09-25,M3 交付生效)**:③过程文档默认翻转——新注册项目的文档根默认位于**代码仓外**(应用管理路径,注册向导默认值断言,SC9/G7),仓内降为兼容选项(既有仓内项目与显式偏好仓内的工作流读写兼容不破坏);仓外路径显式授权要求与授权登记机制不变;indexer/看板/提案板/阶段资产全部按文档根寻址。
**Source**: features/dsh-forge-m3 prd/prd-spec.md §七项交付 7/G7/SC9;apps/plugins RegisterWizard docLocationType 默认 'external'(任务 1.7)

**M4 修订(2026-10-01,M4 交付生效)**:③过程文档位置演进为 **docsPlacement 证据三档**(repo-existing 命中 forge 树沿用仓内 docs/ / repo-new 有 `.git` 仓内新建 / app 无 `.git` 应用管理主路径,内核派生 `<docsRoot>/<文件夹名>` 幂等置备;零 git 强制),custom 高级自定义显式授权(授权在案复检,输入变化即复位)为第四值;**仓内落点永不继承**(黏性禁令,PlacementDraft 每报全量重建的构造保证);v3 存量迁移 in_repo→repo-existing、external→custom('legacy' 冻结值);注册交互 = 添加项目确认卡(代码区唯一必答,见 BIZ-workbench-003 M4 修订)。上游裁决 = docs/decisions/project-storage-and-knowledge.md §5 v2。
**Source**: features/dsh-forge-m4 prd/prd-spec.md §必答③修订/UF7;design/tech-design.md §Interface 1;tasks/records/1.3、1.5

### BIZ-workbench-002: 单激活项目模型(注册不自动激活)

**Rule**: 工作台同一时刻至多一个激活项目(app_state 单激活指针 `active_project_id`,应用层事务不变量);注册成功不自动激活——激活是显式独立动词,切换在事务内完成;移除激活项目时指针在同一事务内清空(ui-design「自动激活剩余首行」口径与落地实现分歧,按实现动词裁决并记录于 feature records)。code_root 注册时规范化(分隔符/尾斜杠统一)后 UNIQUE,重复注册 → ERR_PROJECT_EXISTS。
**Context**: 多项目注册 + 单激活切换(G5);UNIQUE 比对依赖注册期路径规范化。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-002(design/tech-design.md §Interface 1;design/er-diagram.md §app_state;records/5.14、5.gate)

**M4 修订(2026-10-01,M4 交付生效)**:①路径规范化演进为 **D11 三层身份归一化**——应用层归一化单源(拒裸盘符/相对/根 → realpath.native → 前缀剥离 → 正斜杠 → win32 大写折叠 toComparableKey;失败字符串回退 + identityVerified=false 不阻断);UNIQUE 按存储折叠键 `code_root_key` 判重(折叠碰撞显式失败);三层级联判定 canonical 真大小写精确 → pathKey 折叠 → (dev,ino) 物理仲裁,命中即仲裁回写自愈(IdentityHeal)。②boot 语义 = 启动首屏项目工作台,恢复上次活跃项目(无项目 → 空态引导);原位换台(#28)= 会话期切换即重置工作台上下文;移除激活项目指针清空后客户端落首个剩余注册序或空态;注册不自动激活延续。
**Source**: features/dsh-forge-m4 design/tech-design.md §Data Models;tasks/records/1.1、1.2、1.6、2.2、4.3

### BIZ-workbench-003: 注册校验链(forge 数据检出)

**Rule**: 注册路径必须存在且可读(ERR_CODE_ROOT_UNREADABLE),且检出 forge 数据(`.forge/` 与文档位置均无 → ERR_FORGE_NOT_DETECTED,错误引导修正路径或先初始化项目);仓外文档路径必须 ≠ codeRoot(行级 CHECK + ERR_DOC_PATH_CONFLICT),仓外路径须显式授权确认且可读(ERR_EXTERNAL_PATH_UNREADABLE)。
**Context**: 注册向导 ≤3 步与仓外越界防护(PRD 边界约束:仅对已注册项目路径执行 forge CLI)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-003(prd/prd-spec.md §Business Flow 异常流/§Security;design/tech-design.md §Error Handling)

**M4 修订(2026-10-01,M4 交付生效)**:注册 = 添加项目确认卡(v2 面),硬校验**收窄为 存在+目录+可读+跨项目唯一**;**forge 检出门禁废止**——`ERR_FORGE_NOT_DETECTED` 对 v2 面不再产生(D1:desktop 无 `.forge` 侦测信号不成立;侦测 = 信息态 gitRoot/forgeTreeHit/childRepos 固定前缀有界探测,「未检测到 git」= 信息态非错误);可写性改运行时状态(非注册门槛);仓外授权收窄 custom 专属(ERR_EXTERNAL_PATH_UNREADABLE 收窄);提交失败留卡修正不静默。v1 冻结注册面保留旧校验链(M2/M3 兼容,随逃生门退役)——现行 `registry/validate.ts` 的 ERR_FORGE_NOT_DETECTED 仅存于 v1 面。
**Source**: features/dsh-forge-m4 prd/prd-spec.md §必答③修订;design/tech-design.md §Interface 1/§Error Handling;tasks/records/1.3、1.5

## Session Linking

### BIZ-workbench-004: prompt 全量注入与挂接发起侧收敛

**Rule**: 从任务一键发起的 dsh 会话,首条用户消息 = `forge prompt get-by-task-id` 完整输出逐字符注入(100% 自动、零手工粘贴;prompt 原文不改写,仅允许追加归因指令行);任务↔会话挂接关系为工作台自有状态,发起成功即持久化、历史可回溯;dsh 会话无终态信号(AgentStatus 二态 idle/running,disposed/archive 均非会话完成),挂接 status→ended 由发起侧收敛,不以宿主信号为判据。
**Context**: 一键挂接 + 注入链路验收;终态不可得为 spike 实证结论。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-004(prd/prd-spec.md §G2/SC3;design/tech-design.md §Interface 2/§Open Questions;design/spike-1-findings.md)

**M3 修订(2026-09-25,M3 交付生效)**:注入基线演进——首条用户消息 = **内核预合成内容**(任务类型协议 + feature 目标摘要 + 生效偏好三要素,模板库自 forge prompt 移植入内核)+ 追加单行归因指令,`forge prompt get-by-task-id` 独立命令形态淘汰(预合成取代,SC1 零 CLI);逐字符注入与 prompt 原文不改写纪律延续,`prompt_hash` = sha256(组合首条消息全文)随 dispatch 行落库;发起链 = 两段式派发(内核应答随行 launch payload → renderer relay → host `create`(预铸 sessionId 幂等收养)+ `prompt({mode:'queue'})`);M2 UF5「发起会话」入口语义演进为「派发执行」,session-handover 仅纯切视图。挂接终态收敛延续(发起侧 notifyDispatchEnded 回填)。
**Source**: features/dsh-forge-m3 prd/prd-spec.md DF002/§外围命令归宿表;design/tech-design.md §Interface 3;design/spike-3-systemprompt-contract.md;tasks/records/3.5、6.1

**M4 增补(2026-10-01,M4 交付生效)**:追加行**两行化** = 归因行 + 命名行(「执行本任务时,你 spawn 的 subagent 会话须以『\<taskKey\> \<title\>』命名」;M4 必答⑥ 命名约定的注入载体);namingLine 确定性 = taskKey+title 的函数;prompt_hash 口径不变 = sha256(预合成内容 + 追加行全文);追加行在 Go 对拍集外;多模式一致性 = 结构性保证(追加行仅内核 composeFirstUserMessage 一处构造)。
**Source**: features/dsh-forge-m4 design/tech-design.md §Interface 7;tasks/records/2.8

## Stage Gating

### BIZ-workbench-006: 派发前阶段产物齐全性检查 = 确定性代码,warn 不阻断

**Rule**: 新会话/任务派发前,内核对 feature 当前阶段执行期望产物齐全性检查——检查者 = **确定性代码**(文件存在 + frontmatter/结构解析 + SQLite 状态查询),断言无模型调用;缺失 = 警告 + 结构化缺失清单(MissingItem),用户确认(acknowledgeMissing)后可继续派发,**不阻断**。
**Context**: 强制阶段化为「编排层硬门」而非宿主拦截(零宿主侵入);各阶段期望产物清单是 forge 方法论资产(随 forge 仓演进),应用侧仅消费机器可校验定义。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 BIZ-001(prd/prd-spec.md §各阶段期望产物清单/G4/SC4;design/tech-design.md §Interface 5;tasks/records/3.2)

### BIZ-workbench-007: 阶段总结门 + 阶段资产单一规范文件 + 新阶段强制注入 + 偏离可观察

**Rule**: feature 阶段推进以阶段总结为门——资产文件 `features/<slug>/stages/<stage>.md`(frontmatter {stage, generated, goal} + 摘要正文,由 agent 会话经 forge_stage_summarize 写入,T4 单一规范文件、重写覆盖)未生成时 advanceStage 拒绝(ERR_STAGE_GATE_UNSATISFIED)+ 可观察引导;满足则内核写 manifest status(阶段推进内化)→ stage_advanced 事件 → 新阶段会话系统提示词**强制注入**目标 + 摘要(预合成消费 stage_asset)。内容留文件、元数据入 SQLite 快照(派生可重建);终态 completed 重复推进 = 幂等 no-op。外部会话跨阶段操作不硬阻断,看板呈现偏离标识(deviation_detected,仅呈现,合法推进清除偏离且保留审计时间)。
**Context**: 目标与摘要不跨阶段传递为 M3 三问题线之一;T4 裁决弃时间戳多份(门校验幂等、「最新一份」语义清晰)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 BIZ-002(prd/prd-spec.md §阶段资产与文档根数据模型/G4/SC4;design/tech-design.md §Interface 5;tasks/records/4.1-4.4)

## Preferences

### BIZ-workbench-008: 偏好三级继承(键集全量封闭,surfaces 除外)

**Rule**: 运行偏好三级继承链 **feature > 项目 > 全局**,逐级覆盖;键集 = forge config 全量(auto.\*/worktree.\*/eval.\*/coverage.\*)且为封闭注册表(应用层校验,键集外拒绝 ERR_PREF_KEY_UNKNOWN,动态键集不硬编码进 SQL);**surfaces 除外**(结构性项目事实,检测得出,不参与继承);生效值解析(feature 级 scope 限定地址 `<projectId>/<featureSlug>` 防跨项目同 slug 碰撞)反映于预合成产物与编辑面(生效值 + 来源标识);保存 = 校验全前置 + 事务原子,清除覆盖 = 幂等回落。
**Context**: D3 裁决(全量三级化);spike ④ 发现 coverage.\* 键集 PRD 枚举漏列已补(38 键注册表);存储形态 = 单表 scope 化(docs/decisions/data-model.md 2026-09-23)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 BIZ-003(prd/prd-spec.md §PRD 期裁决 D3/G5/SC5;design/tech-design.md §Interface 1/§Data Models prefs;tasks/records/3.1)

## Proposal Board

### BIZ-workbench-009: 提案看板只读(人零写入口)

**Rule**: 文档根 `proposals/` 的看板呈现 = **只读**(列表/详情/eval 报告浏览 + proposal ↔ feature 互跳),无任何状态写入口(域面结构性断言恰两读动词);提案状态流转仍归 agent 会话/终端;外部变更 ≤5s 感知回流(批量事件通道)。
**Context**: 操作主体模型的浏览线延伸——人 = 观察面;提案为管线早期(尚无 feature)资产的唯一 GUI 载体。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m3 BIZ-004(prd/prd-spec.md §七项交付 6/G6/SC6;design/tech-design.md §Interface 1;tasks/records/5.3-5.5)

## Performance Baseline

### BIZ-workbench-005: 工作台时效基线

**Rule**: 会话/终端侧任务变更 → 看板免手动刷新可见 ≤5 秒;看板首屏 ≤2 秒(500 任务规模);一键发起到会话界面可交互 ≤3 秒;规模假设 ≤500 任务/项目、≤50 feature/项目、≤20 注册项目。
**Context**: 状态时效与首屏的产品级量化口径;CI 计时用宽松阈值防抖动。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-005(prd/prd-spec.md §Performance Requirements/§Data storage)

**M4 扩展(2026-10-01,M4 交付生效)**:新增**项目工作台首屏 ≤2s**(500 任务规模;口径 = M2 SC1 继承:行 seam click → 节点齐全 + 2rAF,app 启动段不在预算内)与**投影四操作 ≤2s**(注册/改名/删除 = 实况 registry 收敛窗,归档 = 动词回程 dsh 侧零投影 op;失败降级不阻断);视图切换不劣化 = 重构前已绿预算腿复断言 + 本机数字为新基线行(无 like-for-like 基线时不虚构历史数字);血缘推断 ≤100ms 点击时只读计算。M4 实测基线(SC6 硬门,零容忍超标):首屏 median 574ms@500 任务;注册收敛 median 119ms(max 457ms)。
**Source**: features/dsh-forge-m4 prd/prd-spec.md §Performance Requirements;tasks/records/4.7

## Workspace Projection & Task-Session Binding

### BIZ-workbench-010: workspaceRegistry 单向投影(权威-投影,归档≠删除)

> 原误登记 BIZ-workbench-006(与 M3 Stage Gating 条目撞号),2026-10-01 对账修复重排为 010。

**Rule**: forge 项目注册表为权威,dsh workspaceRegistry 为单向投影——注册(新增,同名同序)、改名(同步)、归档(workspace 保留,会话仍按项目分组;forge 侧移入归档分区,项目会话列表不再展示)、删除(workspace 移除,会话按 dsh 语义退未分组、历史不删除)四操作同步;任何入口禁止反向写——dsh 侧手改仅对账呈现偏差提示;投影写入失败降级为无投影继续运行,不阻断注册/改名/归档,可手动重试。
**Context**: 双向同步引入双写源与冲突合并;归档≠删除保历史分组可找回(workspaceRegistry 移除语义本身不删会话)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4(prd/prd-spec.md §必答④⑤;PRD 期裁决 1)

**M4 执行期增补(2026-10-01)**:偏差三类(renamed/deleted/reordered)以**最近成功 push** 为基线,DeviationRow 读时重算物化、零落表(投影域内无以实况为权威的写集产出 = 结构保证);零反向写以「偏差后零通道调用/零 push 事件」断言锁证;**归档不对账、不推送**(空 ops plan 会把归档项目推成 healthy 噪音);收敛仅经用户 retryProjection(幂等全量重推,**单 plan 自包含收敛全部期望状态**,reorder op 随每个 plan 携带)或生命周期 hook push——对账重算不自动触发 push(push→快照→对账→push 自激环);dsh 侧删除重建(同 path 异 id)≠ deleted 偏差 → ensure op 复连(create-or-adopt);reorder 仅 forge 所属子集相对序;relay 缺席世界的移除 = 事件无人消费即接受(dsh 侧孤儿 workspace 为用户自有数据)。通道工程见 TECH-host-007。
**Source**: features/dsh-forge-m4 tasks/records/3.1-3.7

### BIZ-workbench-011: subagent 归拢与任务反查(血缘推断权威,命名辅助)

> 原误登记 BIZ-workbench-007(与 M3 阶段总结门条目撞号),2026-10-01 对账修复重排为 011。

**Rule**: subagent 会话(origin=subagent)在项目会话列表归拢于 parent 会话血缘树下——顶层永不平铺、默认收起(计数徽标 = 运行中/总数,超上限尾部「查看全部」);任务↔subagent 绑定 = 运行时血缘推断(任务 → session_links active 顶层会话 → 血缘树内后代),不落库、可随时重算;派发 prompt 约定执行 subagent 以「任务 id + title」命名——命名仅辅助可读,与血缘冲突时以血缘为准;多任务共会话场景降级为会话级标注(「该会话执行中」)。
**Context**: 零新协议面、数据完备;回写(任务级精度)后置 M5 派发协议重构。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4(prd/prd-spec.md §必答⑥;PRD 期裁决 2)

**M4 执行期增补(2026-10-01)**:血缘推断 = **client 半身只读推导服务**(上游会话快照 subagentsByParent catalog ⊕ byId 回填双源并集 join + 内核 session_links;T2 裁决——数据局部性在 renderer);计算 ≤100ms 协作式 deadline,超时弃全树仅顶层(宁缺勿错);降级双因同型(budget-expired/snapshot-absent → 静默 + 单行结构化 log + 零抛错,恢复即重算);ended 挂接行 = 历史快照展开(disposed、byId 缺席 = 「不可用」座位而非隐藏);反向徽标覆盖 = badges 命中祖先链任一节点(active+ended 均计)∨ 自身入 executing 树,ambiguous = 覆盖 >1;后代 20 上限 = DFS 截断 + total 全量。
**Source**: features/dsh-forge-m4 design/tech-design.md §Interface 3;tasks/records/2.5-2.7

### BIZ-workbench-012: 「执行中」判定(状态 × 挂接正交)

> 原误登记 BIZ-workbench-008(与 M3 偏好三级继承条目撞号),2026-10-01 对账修复重排为 012。

**Rule**: 任务「正在执行」的呈现判定 = status=in_progress 且存在 active 会话挂接;status 与会话挂接为正交事实——in_progress 而无 active 挂接的任务常规展示并标注「未挂接会话」,不得计入执行中突出呈现。
**Context**: 状态生命周期(forge 状态机)与会话挂接(发起侧收敛,见 BIZ-workbench-004)是两个事实源;任务反查与概览执行中分组共用此判定,避免「点执行中任务却无会话可开」的空转。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4(prd/prd-spec.md §必答⑦;PRD 期裁决 3)

## Layout Memory & Detached Windows(M4)

### BIZ-workbench-013: 布局记忆项目域(删除即清除 · 用户级分治 · 存在性判别)

**Rule**: 布局记忆**按项目存储**(分屏 pane 结构与比例/树姿态与收起/拆出窗口集合),项目删除时随之清除(FK cascade + 引擎 forget **动词前** disarm 取消 pending 写 + 内核拒绝迟到写双保险);用户级视图选项(分组×排序)恒不入项目域(localStorage);恢复 = 重放 open 操作序列——forge 只重放自己所属的开操作,原生 rightbar per-session 持久化与原生外分隔条一概不读不写不重放(双轨并行不冲突);记忆存在性以**行存在信号**(stored 布尔)判别——默认布局与合法空记忆内容同形,内容判别会错杀合法空记忆;违规 blob 落默认重置不弹错(违规重置行仍 stored=true,行在即记忆语义在)。
**Context**: T4 裁决(PRD「项目删除随之清除」→ FK cascade;e2e 重启可断言);fix-2 stored 修法(4.6 诊断首启默认 blob 覆写激活自动展开回归:内容判别的失效模式)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4(prd/prd-spec.md §Data Requirements;design/tech-design.md §Interface 4;tasks/records/4.1、4.5、fix-2)

### BIZ-workbench-014: 拆出窗口语义(单实例不变 · 钉项目 · 关闭≡收回)

**Rule**: 拆出窗口(detached)仍属应用单实例——主窗用户径关闭 = 托盘驻留(隐藏非销毁,detached 不被误清);应用退出 = 主窗 closed recallAll 清扫全部 detached;detached 窗**钉死来源项目**(不随主窗激活指针,项目源唯一 = 握手 role.projectId);OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启;与 [收回] 按钮汇流同一 closed 终态);窗口标题 = 「\<项目名\> · \<视图名\>」**归主进程组装**(渲染层 document.title 不夺 OS 窗题;page-title-updated 守卫挡下+重申);归档项目窗口标题携带「已归档」后缀。
**Context**: PRD 必答⑨ 壳行为对账(单实例/托盘 M1 语义不动);fix-3(标题权威:Electron 默认把渲染层 document.title 应用于窗题,vendored SPA 自设标题会盖掉主进程组装值)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4(prd/prd-spec.md §必答⑨;design/tech-design.md §Interface 5;tasks/records/4.2、4.3、4.6、fix-3)
