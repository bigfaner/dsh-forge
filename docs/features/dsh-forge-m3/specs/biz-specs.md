---
feature: "dsh-forge-m3"
generated: "2026-09-25"
status: draft
---

# Business Rules: dsh-forge-m3(流程即产品)

> 提取源:prd/prd-spec.md(2026-09-23)+ proposals/dsh-forge-m3/proposal.md(决策日志)+ tasks/records/1-6.summary(执行期裁决)。非交互模式:CROSS 项自动集成(任务 consolidate-specs.md 指令)。

## 阶段化编排(Stage Gating)

### BIZ-001: 派发前阶段产物齐全性检查 = 确定性代码,warn 不阻断

**Rule**: 新会话/任务派发前,内核对 feature 当前阶段执行期望产物齐全性检查——检查者 = 确定性代码(文件存在 + frontmatter/结构解析 + SQLite 状态查询),断言无模型调用;缺失 = 警告 + 缺失清单(结构化 MissingItem),用户确认(acknowledgeMissing)后可继续派发,不阻断。
**Context**: 强制阶段化为「编排层硬门」而非宿主拦截(零宿主侵入);各阶段期望产物清单是 forge 方法论资产,应用侧仅消费机器可校验定义,不在 PRD/设计期之外新增语义。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §各阶段期望产物清单/§Flow 阶段线/G4/SC4;design/tech-design.md §Interface 5;records/3.2

### BIZ-002: 阶段总结门 + 阶段资产单一规范文件 + 新阶段强制注入 + 偏离可观察

**Rule**: feature 阶段推进以阶段总结为门——资产文件 `features/<slug>/stages/<stage>.md`(frontmatter {stage, generated, goal} + 摘要正文,由 agent 会话经 forge_stage_summarize 写入)未生成时,advanceStage 拒绝(ERR_STAGE_GATE_UNSATISFIED)+ 可观察引导;满足则推进 + `stage_advanced` 事件,新阶段会话系统提示词强制注入目标 + 摘要(预合成消费 stage_asset)。内容留文件、元数据入 SQLite 快照(派生可重建)。外部会话跨阶段操作不硬阻断,看板呈现偏离标识(deviation_detected,仅呈现)。
**Context**: 目标与摘要不跨阶段传递是 M3 三问题线之一;T4 裁决 = 单一规范文件(重写覆盖),弃时间戳多份(门校验幂等、「最新一份」语义清晰)。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §阶段资产与文档根数据模型/G4/SC4;design/tech-design.md §Interface 5(T4);records/4.1-4.4

### BIZ-003: 偏好三级继承(键集全量封闭,surfaces 除外)

**Rule**: 运行偏好三级继承链 feature > 项目 > 全局,逐级覆盖;键集 = forge config 全量(auto.*/worktree.*/eval.*/coverage.*)且为封闭注册表(应用层校验,键集外拒绝),**surfaces 除外**(结构性项目事实,检测得出,不参与继承);生效值解析反映于预合成产物与编辑面(生效值 + 来源标识);feature 级 scope 限定地址 `<projectId>/<featureSlug>` 防跨项目同 slug 碰撞。
**Context**: D3 裁决(全量三级化);M2 期偏好仅项目级;spike ④ 发现 coverage.* 键集 PRD 枚举漏列,已补入注册表(38 键)。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §PRD 期裁决 D3/§偏好三级模型/G5/SC5;design/tech-design.md §Interface 1/§Data Models prefs;records/3.1

## 提案与浏览面

### BIZ-004: 提案看板只读(人零写入口)

**Rule**: 文档根 `proposals/` 的看板呈现 = 只读(列表/详情/eval 报告浏览 + feature 互跳),无任何状态写入口;提案状态流转仍归 agent 会话/终端;外部变更 ≤5s 感知回流。
**Context**: 操作主体模型的浏览线延伸——人 = 观察面;提案为管线早期(尚无 feature)资产的唯一 GUI 载体。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §七项交付 6/G6/SC6;design/tech-design.md §Interface 1 proposal 动词;records/5.3-5.5

## 数据权威与迁移(SoT 分治)

### BIZ-005: SoT 分治——任务结构化状态以 SQLite 为权威,文档资产留文件

**Rule**: 任务结构化状态(ID/状态/依赖/标题)以 SQLite `task` 表为权威(单写者 = 内核,读路由按 `projects.data_authority` 渐进切换);`tasks/index.json` 一次性显式迁移后终态淘汰(归档 `.migrated-<ts>`);任务/记录 md 与阶段资产等文档资产留文件不入库(默认仓外文档根,仓内兼容),内容权威在文件;「禁双写」纪律收敛为「内核唯一写者 + 外部写自动重摄入」,不再有第二写者。
**Context**: 根除 index.json 多写者风险(SC8 spike §4 旧写者静默丢未知字段);拒绝「全量入库」(git 评审断裂)与「全量留文件」(多写者永续)两端;docs/decisions/architecture.md 2026-09-23 已记决策。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §What 2/§Data Requirements/G2/SC2;design/tech-design.md §Overview T1/§Interface 4;records/1.3-1.5
**Target 注记**: 以新条目 BIZ-coexistence-003 落 coexistence.md,并对 BIZ-coexistence-002 补 M3 修订注记(其「forge 文件为唯一事实源」绝对表述已被分治收窄)。

### BIZ-006: 显式迁移纪律(确认 + 备份 + 原子 + 对拍零差异 + 零半迁移)

**Rule**: index.json → SQLite 权威迁移为一次性**显式**操作(M2 已注册项目工作台入口 + 新注册向导内同一确认步骤):迁移前自动备份(`<userData>/workbench/backups/`,库文件 + tasks/ 文档树);管线 = 守卫(在跑编排 dispatch.ended_at IS NULL > 0 → ERR_MIGRATION_GUARD)→ 备份 → 单事务摄入 → 对拍(任务全集 vs 派生投影零差异,差异 → 回滚 + ERR_MIGRATION_VERIFY)→ 切读置位 → 归档改名,COMMIT 收口在归档改名后,任一相失败整体回滚;中断可重试且**零半迁移态**;`tasks/*.md` 与 `tasks/records/*.md` 不迁移不改动。
**Context**: D1 裁决(显式迁移,弃自动触发);旧写者静默丢字段的结构风险使原子性与对拍为验收硬口径(SC2/G2)。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §PRD 期裁决 D1/DF001/G2/SC2;design/tech-design.md §Interface 4;records/1.4/6.3
**Target 注记**: 新文件 docs/business-rules/sot-migration.md,BIZ-migration-001。

### BIZ-007: 外部写自动重摄入 + 偏离可观察,不阻断外部会话

**Rule**: 已迁移项目检出 `index.json` 复现/变更(watcher,存在即信号)→ 幂等重摄入(sha256 指纹集去重 + 单事务 delete-then-insert + 同一对拍 oracle 校验)→ `projects.deviated=1` + `deviation_detected` 事件 + migration_event(reingest) 留档;失败仅记录不阻断外部会话;偏离仅呈现,人决定是否处理。
**Context**: T3 裁决(弃「仅告警不摄入」——SQLite 与 index.json 持续分叉则权威名存实亡);过渡双形态不破坏(SC7/SC8)。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §Flow 迁移线/SC7;design/tech-design.md §Interface 4.7/§Appendix T3;records/1.5
**Target 注记**: docs/business-rules/sot-migration.md,BIZ-migration-002。

## 操作主体(已集成,登记为重叠跳过)

### BIZ-008: 操作主体模型 M3 定形(任务写 = agent 域经 dsh tool;人 = 观察与编排发起)

**Rule**: 任务状态变更唯一通道 = agent 会话经 dsh tool(actor 标识审计);人 = 观察与编排发起(派发/审批/迁移/偏好),无任务写 UI;外部会话(终端/冻结 CC 插件)过渡期照旧不硬阻断。
**Context**: M3 定形;files 权威项目写集拒绝为业务提示(走 CLI)非错误噪音。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §操作主体模型;proposals/dsh-forge-m3/proposal.md 决策日志③
**Target 注记**: **已集成**——BIZ-task-ops-001 已含「M3 修订(2026-09-23)」块(集成时间早于本任务);本条登记为重叠,集成动作为 skip(避免重复条目)。

## 文档根与注入(漂移修订项)

### BIZ-009: 过程文档默认仓外(注册默认值翻转)

**Rule**: 新注册项目的过程文档根默认位于代码仓外(应用管理路径),仓内为兼容可选项(既有仓内项目与显式偏好仓内的工作流不破坏);indexer/看板/提案板/阶段资产全部按文档根寻址;仓外路径须显式授权。
**Context**: G7/SC9;M2「仓内默认 + 仓外默认关闭」翻转;BIZ-workbench-001 现行文本仍表述「仓内默认/仓外默认关闭」,与本规则冲突 → 漂移。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §七项交付 7/G7/SC9;records/1.7(RegisterWizard docLocationType 默认 'external')
**Target 注记**: 以 M3 修订块更新 BIZ-workbench-001(漂移修复,保留原 ID)。

### BIZ-010: 预合成取代 forge prompt 注入(注入契约 ④)

**Rule**: 派发执行链中,subagent 首条用户消息 = 内核预合成内容(任务类型协议 + feature 目标摘要 + 生效偏好)整体注入 + 追加单行归因指令;原文不改写;`forge prompt get-by-task-id` 独立命令形态淘汰(模板入内核模板库);prompt 全量逐字符注入与挂接语义由 dispatch 链承接。
**Context**: M2 BIZ-workbench-004 的「首条消息 = forge prompt CLI 输出注入」已被取代(M3 交付后);spike ③ 裁决注入契约 = ④ 首条 user 消息追加。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md DF002/§外围命令归宿表;design/tech-design.md §Interface 3;spike-3-systemprompt-contract.md;records/3.4/3.5
**Target 注记**: 以 M3 修订块更新 BIZ-workbench-004(漂移修复,保留原 ID)。

## 特定于本 feature 的记账(LOCAL)

### BIZ-011: 外围命令归宿表(CLI 全量归宿)

**Rule**: forge CLI 命令全量归宿表(18 行)随 M3 落地;执行权威 = tech-design Interface 2 封闭动词集——quality-gate/cleanup/worktree/verify-task-done 四动词 M3 不落「内核 API + dsh tool」,延至 M4(2026-09-23 breakdown-tasks 期用户裁决)。
**Scope**: [LOCAL]
**Source**: prd/prd-spec.md §外围命令归宿表 + 归宿分解决议;records/6.1(18 行逐行核验)

### BIZ-012: 技能迁移划分(15 必迁 + 2 取代 + 20 暂缓 = 37)

**Rule**: 15 项必迁技能(核心执行闭环 6 + 管线创作系 6 + 生成系 3)以 dsh 原生扁平名随插件 bundle;2 项被机制取代(execute-task/run-tasks);20 项暂缓 M4 逐项归宿。
**Scope**: [LOCAL]
**Source**: prd/prd-spec.md §技能迁移划分表(D2/D5);records/5.6

### BIZ-013: 各阶段期望产物清单矩阵

**Rule**: prd/design/tasks/in-progress/completed 五阶段累计式期望产物矩阵(文件存在 + frontmatter + SQLite 状态查询)为 forge 方法论资产,随 forge 仓演进,应用仅消费机器可校验定义。
**Scope**: [LOCAL]
**Source**: prd/prd-spec.md §各阶段期望产物清单;records/3.2(PRD 五阶段累计式期望矩阵落地)

### BIZ-014: D1-D5 PRD 期裁决

**Rule**: 显式迁移(D1)/customSkillDirs 承载(D2)/偏好键集全量(D3)/知识系入 tool(D4)/技能必迁范围(D5)五项裁决;决策已由 docs/decisions 记账,细则由上述各条承载。
**Scope**: [LOCAL]
**Source**: prd/prd-spec.md §PRD 期裁决
