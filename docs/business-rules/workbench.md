---
title: "工作台业务规则(项目三分模型 · 单激活 · 会话挂接 · 时效基线)"
domains: [project-registration, doc-location, session-link, stage-gates, prefs-inheritance, proposal-board, freshness-baseline]
---

# 工作台业务规则(项目三分模型 · 单激活 · 会话挂接 · 时效基线)

## Project Registration

### BIZ-workbench-001: 项目三分模型与工作台自有状态

**Rule**: forge 项目注册采用三分模型——①代码根目录;②工作台自有状态(项目注册表/挂接索引/视图状态,独立存放,不与 forge 数据混放);③过程文档位置(仓内默认 / 仓外本地路径可选)。仓外文档默认关闭,须注册向导显式选择并显式授权(授权登记持久化于自有状态,校验链只读登记,无入参旗标绕过通道);移除注册仅级联清除快照/挂接等自有数据,不触碰项目仓内文件与 forge 数据。
**Context**: 过程资产可不入代码仓与数据所有权隔离(PRD 存储约束/DF005)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-001(prd/prd-spec.md §In Scope/§G5/DF005;design/tech-design.md §Interface 1/§Data Models)

**M3 修订(2026-09-25,M3 交付生效)**:③过程文档默认翻转——新注册项目的文档根默认位于**代码仓外**(应用管理路径,注册向导默认值断言,SC9/G7),仓内降为兼容选项(既有仓内项目与显式偏好仓内的工作流读写兼容不破坏);仓外路径显式授权要求与授权登记机制不变;indexer/看板/提案板/阶段资产全部按文档根寻址。
**Source**: features/dsh-forge-m3 prd/prd-spec.md §七项交付 7/G7/SC9;apps/plugins RegisterWizard docLocationType 默认 'external'(任务 1.7)

### BIZ-workbench-002: 单激活项目模型(注册不自动激活)

**Rule**: 工作台同一时刻至多一个激活项目(app_state 单激活指针 `active_project_id`,应用层事务不变量);注册成功不自动激活——激活是显式独立动词,切换在事务内完成;移除激活项目时指针在同一事务内清空(ui-design「自动激活剩余首行」口径与落地实现分歧,按实现动词裁决并记录于 feature records)。code_root 注册时规范化(分隔符/尾斜杠统一)后 UNIQUE,重复注册 → ERR_PROJECT_EXISTS。
**Context**: 多项目注册 + 单激活切换(G5);UNIQUE 比对依赖注册期路径规范化。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-002(design/tech-design.md §Interface 1;design/er-diagram.md §app_state;records/5.14、5.gate)

### BIZ-workbench-003: 注册校验链(forge 数据检出)

**Rule**: 注册路径必须存在且可读(ERR_CODE_ROOT_UNREADABLE),且检出 forge 数据(`.forge/` 与文档位置均无 → ERR_FORGE_NOT_DETECTED,错误引导修正路径或先初始化项目);仓外文档路径必须 ≠ codeRoot(行级 CHECK + ERR_DOC_PATH_CONFLICT),仓外路径须显式授权确认且可读(ERR_EXTERNAL_PATH_UNREADABLE)。
**Context**: 注册向导 ≤3 步与仓外越界防护(PRD 边界约束:仅对已注册项目路径执行 forge CLI)。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-003(prd/prd-spec.md §Business Flow 异常流/§Security;design/tech-design.md §Error Handling)

## Session Linking

### BIZ-workbench-004: prompt 全量注入与挂接发起侧收敛

**Rule**: 从任务一键发起的 dsh 会话,首条用户消息 = `forge prompt get-by-task-id` 完整输出逐字符注入(100% 自动、零手工粘贴;prompt 原文不改写,仅允许追加归因指令行);任务↔会话挂接关系为工作台自有状态,发起成功即持久化、历史可回溯;dsh 会话无终态信号(AgentStatus 二态 idle/running,disposed/archive 均非会话完成),挂接 status→ended 由发起侧收敛,不以宿主信号为判据。
**Context**: 一键挂接 + 注入链路验收;终态不可得为 spike 实证结论。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m2 BIZ-004(prd/prd-spec.md §G2/SC3;design/tech-design.md §Interface 2/§Open Questions;design/spike-1-findings.md)

**M3 修订(2026-09-25,M3 交付生效)**:注入基线演进——首条用户消息 = **内核预合成内容**(任务类型协议 + feature 目标摘要 + 生效偏好三要素,模板库自 forge prompt 移植入内核)+ 追加单行归因指令,`forge prompt get-by-task-id` 独立命令形态淘汰(预合成取代,SC1 零 CLI);逐字符注入与 prompt 原文不改写纪律延续,`prompt_hash` = sha256(组合首条消息全文)随 dispatch 行落库;发起链 = 两段式派发(内核应答随行 launch payload → renderer relay → host `create`(预铸 sessionId 幂等收养)+ `prompt({mode:'queue'})`);M2 UF5「发起会话」入口语义演进为「派发执行」,session-handover 仅纯切视图。挂接终态收敛延续(发起侧 notifyDispatchEnded 回填)。
**Source**: features/dsh-forge-m3 prd/prd-spec.md DF002/§外围命令归宿表;design/tech-design.md §Interface 3;design/spike-3-systemprompt-contract.md;tasks/records/3.5、6.1

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
