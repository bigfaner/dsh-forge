---
feature: "dsh-forge-m4"
generated: "2026-10-01"
status: draft
---

# Business Rules: dsh-forge-m4(项目中心工作台)

> 提取源:prd/prd-spec.md(2026-09-27 修订版)+ proposals/dsh-forge-m4/proposal.md(2026-09-24)+ design/tech-design.md(2026-09-28)+ tasks/records/1-4.summary + fix-1~fix-4 + run-test(执行期裁决)。非交互模式:CROSS 项自动集成(任务 consolidate-specs.md 指令)。
> 对账前提:docs/business-rules/workbench.md 已含 M4 规划期入库的投影/subagent/执行中三条 —— 规划期集成误复用 006/007/008(与 M3 Stage Gating/偏好条目撞号,违反「max existing NNN + 1」序规则);本次执行期对账一并修复(renumber → BIZ-workbench-010/011/012,保留 M3 原号)。M4 期 feature 文档与源码注释中「BIZ-workbench-006/007/008」指投影/subagent/执行中三条者,按本映射读作 010/011/012。

## 项目注册与身份(D11 执行期)

### BIZ-001: 注册 = 添加项目确认卡,硬校验收窄(证据三档,零 git 强制)

**Rule**: 注册交互 = 「添加项目确认卡」,代码区(anchor)为唯一必答;forge 文件区 = 文档位置预览行,证据三档门控(命中 forge 树沿用仓内 docs/ / 有 `.git` 仓内新建 / 无 `.git` 应用管理主路径 app 档,内核派生 `<docsRoot>/<文件夹名>` 幂等置备);硬校验收窄为 存在+目录+可读+跨项目唯一;可写性改运行时状态(非注册门槛);`ERR_FORGE_NOT_DETECTED` 废止 —— forge 检出 = 信息态侦测(gitRoot/forgeTreeHit/childRepos 固定前缀有界探测,条目帽 16/256,零 glob 零正文),「未检测到 git」= 信息态非错误;仓外授权收窄至 custom 高级自定义(授权在案复检 + custom 输入变化即授权复位);仓内落点永不继承(黏性禁令,PlacementDraft 每报全量重建的构造保证);提交失败留卡修正不静默(成功态 submitting 不复位防双击双写)。v1 冻结注册面保留旧校验链(M2/M3 兼容,随逃生门退役)。
**Context**: 2026-09-26 裁决 = docs/decisions/project-storage-and-knowledge.md §5 v2(D11 三层身份/证据三档/零 git 强制);desktop 无 `.forge` 侦测信号不成立(D1)。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §必答③修订/UF7;design/tech-design.md §Interface 1;records 1.2、1.3、1.5
**Target 注记**: 修订 BIZ-workbench-001(③过程文档位置 → docsPlacement 证据三档)+ BIZ-workbench-003(forge 检出门禁废止,保留 ID)。

### BIZ-002: 项目身份三层归一与仲裁自愈(code_root_key UNIQUE)

**Rule**: 代码根身份 = 应用层归一化单源(入口拒裸盘符/相对/根 → realpath.native → 前缀剥离 → 正斜杠 → win32 大写折叠 toComparableKey;realpath 失败字符串回退 + `identity_verified=0`,不抛出不阻断);三层级联判定 = canonical 真大小写精确相等 → pathKey 折叠键(大小写漂移/非 realpath 形态,命中回写治愈 canonical)→ (dev,ino) 物理仲裁(目录改名悬挂键);任意层命中即仲裁回写自愈(IdentityHeal,probe null 保留存量,heal=null 零写);UNIQUE 按存储折叠键判重,折叠碰撞 UPDATE 违例整段回滚显式失败。
**Context**: D11 三层身份;M2 期规范化仅分隔符/尾斜杠统一 + 裸 code_root UNIQUE —— M4 演进为折叠键 + 物理身份仲裁(展示路径 code_root 不参与比较)。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Data Models/§Cross-Layer Data Map;records 1.1、1.2
**Target 注记**: 修订 BIZ-workbench-002(规范化粒度 M4 演进)。

### BIZ-003: 单激活模型 M4 演进(boot 恢复上次活跃 + 原位换台重置)

**Rule**: 启动首屏 = 项目工作台,恢复上次活跃项目(无项目 → 空态引导「添加项目」,boot 归一于 apply 而非改视图键机器);原位换台(#28)= 会话期切换项目即重置工作台上下文(开始页/归档横幅/右栏 doc·depgraph tab 关闭回概览;subagent 收起与布局归布局记忆/换台写离);移除激活项目指针事务内清空后,客户端落首个剩余注册序或空态引导;注册仍不自动激活(语义不变)。
**Context**: 2026-09-27 裁决 #26(启动首屏=工作台)/#28(原位换台);M2「注册不自动激活」延续。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §必答①/§Flow;records 1.6、2.2、3.5、4.3
**Target 注记**: 修订 BIZ-workbench-002(boot 恢复与换台重置增补)。

## 投影与血缘(执行期增补)

### BIZ-004: 投影单向语义执行期增补(偏差物化零落表/归档不对账/收敛单源)

**Rule**: 在既有单向投影规则基线上:偏差三类(renamed/deleted/reordered)均以**最近成功 push** 为基线,DeviationRow 读时重算物化、零落表(投影域内无以实况为权威的写集产出 = 结构保证);偏差仅呈现 + 折叠零交互件,零反向写以「偏差后零通道调用/零 push 事件」断言锁证;归档不对账、不推送(空 ops plan 会把归档项目推成 healthy 噪音;归档/恢复/归档态改名/归档态 retry 四腿零通道调用);收敛仅经用户 retryProjection(幂等全量重推,**单 plan 自包含收敛全部期望状态**,reorder op 随每个 plan 携带)或生命周期 hook push —— 对账重算不自动触发 push(push→快照→对账→push 自激环);dsh 侧删除重建(同 path 异 id)≠ deleted 偏差 → ensure op 复连(create-or-adopt 语义,成功 outcome 刷新 workspace_id);reorder 仅 forge 所属子集相对序,不动用户自有 workspace;relay 缺席世界的移除 = 事件无人消费即接受(dsh 侧孤儿 workspace 为用户自有数据,期望行已 cascade 清除无重试面)。
**Context**: 3.summary「投影单向纪律结构面」;3.4/3.7 裁决(与「禁静默丢弃」不冲突 —— 该约束面向期望在库的可重试 plan)。
**Scope**: [CROSS]
**Source**: records 3.1-3.7(3.1 偏差基线/3.2 不自激/3.4 归档零 op/3.7 零反向写断言)
**Target 注记**: 修订 BIZ-workbench-010(执行期增补块;原误登记 006)。

### BIZ-005: 血缘推断执行期口径(降级双因/ended 快照/徽标覆盖)

**Rule**: 在既有 subagent 归拢反查规则基线上:血缘推断 = client 半身只读推导服务(上游会话快照 `subagentsByParent` catalog ⊕ byId 行回填双源并集 join + 内核 session_links);计算 ≤100ms 协作式 deadline(每 64 节点读一次钟,单一 now() 缝),超时弃全树仅顶层(宁缺勿错 —— 部分树会误导徽标计数),规模本身不触发降级;降级双因同型(budget-expired/snapshot-absent → 静默 + [forge-lineage] 单行结构化 log + 零抛错,纯函数恢复即重算);ended 挂接行 = 历史快照展开(会话已 disposed、byId 缺席 = 「不可用」座位而非隐藏);反向徽标覆盖判定 = badges 命中祖先链任一节点(active+ended 均计)∨ 自身入 executing 树;ambiguous = 覆盖 >1(不引入「最新 active 优先」私设规则);后代 20 上限 = DFS 截断 + total 全量(「查看全部」语义)。
**Context**: T2 裁决(数据局部性在 renderer);2.5/2.6/2.7 records。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 3;records 2.5、2.6、2.7
**Target 注记**: 修订 BIZ-workbench-011(执行期增补块;原误登记 007)。

## 注入与时效

### BIZ-006: 派发追加行两行化(归因 + 命名)

**Rule**: 派发预合成追加行由单行归因扩展为**两行 = 归因行 + 命名行**(「执行本任务时,你 spawn 的 subagent 会话须以『\<taskKey\> \<title\>』命名」);namingLine 确定性 = taskKey+title 的函数(可入 hash);prompt_hash 口径不变 = sha256(预合成内容 + 追加行全文);追加行不在 Go 对拍集内(模板基线零影响);多模式一致性 = 结构性保证(追加行仅内核 composeFirstUserMessage 一处构造,标准/PTC/极简为 host 侧会话预设无模式分支,跨类型协议反证测试固化)。
**Context**: PRD 必答⑥ 命名约定(可读性 + 双重校验,血缘为准);tech-design Interface 7 定稿文案逐字。
**Scope**: [CROSS]
**Source**: design/tech-design.md §Interface 7;records 2.8
**Target 注记**: 修订 BIZ-workbench-004(M4 两行化增补);口径细节同时修订 TECH-host-006(见 tech-specs TECH-001)。

### BIZ-007: 时效基线 M4 扩展(工作台首屏/投影操作 ≤2s)

**Rule**: 在既有时效基线基线上:项目工作台首屏 ≤2s(500 任务规模;口径 = M2 SC1 继承:行 seam click → 节点齐全 + 2rAF,app 启动段不在预算内,median of 3 measured boots 预热不计);投影四操作(注册/改名/归档/删除)同步完成 ≤2s(失败降级不阻断;注册/改名/删除 = 实况 registry 收敛窗,归档 = 动词回程 dsh 侧零投影 op);视图切换不劣化 = 重构前已绿预算腿复断言 + 本机数字为新基线行(无 like-for-like 基线时不虚构历史数字);血缘推断 ≤100ms 点击时只读计算(超时降级仅顶层,无常驻索引开销)。M4 实测基线:首屏 median 574ms@500 任务;注册收敛 median 119ms(max 457ms)。
**Context**: SC6 硬门(零容忍超标即红);4.7 切换不劣化诚实口径。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §Performance Requirements;records 4.7
**Target 注记**: 修订 BIZ-workbench-005(M4 扩展块)。

## 布局与多窗口

### BIZ-008: 布局记忆项目域(删除即清除/用户级分治/存在性判别)

**Rule**: 布局记忆**按项目存储**(分屏 pane 结构与比例/树姿态与收起/拆出窗口集合),项目删除时随之清除(FK cascade + 引擎 forget **动词前** disarm 取消 pending 写 + 内核 ERR_PROJECT_NOT_FOUND 拒绝迟到写 = 双保险,防 cascade 后迟到写复活行);用户级视图选项(分组×排序)恒不入项目域(localStorage);恢复 = 重放 open 操作序列 —— forge 只重放自己所属的开操作,原生 rightbar per-session 持久化与原生外分隔条一概不读不写不重放(双轨并行,粒度不同不冲突);记忆存在性以**行存在信号**(stored 布尔)判别 —— 默认 blob 与合法空记忆(「用户真的收起了一切后离开」)内容同形,内容判别会错杀合法空记忆;违规 blob 落默认重置不弹错(行在即记忆语义在,违规重置行仍 stored=true);写路径 = 800ms 尾随 debounce(拖动突发合并一写)+ 换台写离(离开前布局即时落库)。
**Context**: T4 裁决(PRD「项目删除随之清除」→ FK cascade;e2e 重启可断言);fix-2(stored 修法:4.6 诊断首启默认 blob 覆写激活自动展开回归)。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §Data Requirements;design/tech-design.md §Interface 4;records 4.1、4.5、fix-2
**Target 注记**: 新增 BIZ-workbench-013。

### BIZ-009: 拆出窗口语义(单实例不变/钉项目/关闭≡收回)

**Rule**: 拆出窗口(detached)仍属应用单实例 —— 主窗用户径关闭 = 托盘驻留(隐藏非销毁,detached 不被误清);应用退出(app.quit 漏斗)= 主窗 closed recallAll 清扫全部 detached;detached 窗**钉死来源项目**(不随主窗激活指针,项目源唯一 = 握手 role.projectId);OS 标题栏关闭 ≡ 收回(主窗 pane 原位恢复,不待重启;与 [收回] 按钮汇流同一 closed 终态,客户端零区分代码);窗口标题 = 「\<项目名\> · \<视图名\>」归主进程组装(渲染层 document.title 不夺 OS 窗题;page-title-updated 守卫挡下+重申);归档项目窗口标题携带「已归档」后缀(事件时点重算即时合并)。
**Context**: PRD 必答⑨ 壳行为对账(单实例/托盘 M1 语义不动);fix-3(标题权威)。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §必答⑨;design/tech-design.md §Interface 5;records 4.2、4.3、4.6、fix-3
**Target 注记**: 新增 BIZ-workbench-014。

## 降级呈现

### BIZ-010: 可操作降级呈现注记(状态行 + 唯一重试动作)

**Rule**: 在非致命失败静默降级基线上,M4 增一族「可操作降级呈现」:投影降级/偏差 = 概览状态行(StateDot 三态互斥 + [重试投影] 仅 degraded)+ 结构化 log,非弹错、不阻断、不自动重试(重试是用户动作;装载后重放仅限 plan 从未被消费的通道缺席语义);血缘降级 = 静默 + log(仅顶层呈现);布局 blob 违规 = 重置默认 + log(不弹错);归档项目不渲染投影状态行(归档不对账,呈现只会制造噪音)。
**Context**: PRD Monitoring(「投影降级与偏差提示以本地 UI 呈现,用户可见即达」);3.5/4.1。
**Scope**: [CROSS]
**Source**: prd/prd-spec.md §Monitoring Requirements;records 3.5、4.1
**Target 注记**: 修订 BIZ-resilience-001(M4 注记)。

## 特定于本 feature 的记账(LOCAL)

### BIZ-011: M4 迁移清单七行与零缩水台账(62 fixme = 有档挂起)

**Rule**: 必答②迁移清单七行逐行终验落档(regression-inventory §一);62 fixme = 有档挂起(开放项 A-F 逐腿指针在案;挂起 ≠ 删除,恢复以台账记账为凭);断言本体零删改,仅四处宿主方言改写(入口/寻址面);SC8 废止口径落档(P4 终验 = SC1-SC7)。
**Scope**: [LOCAL]
**Source**: records 1.8、2.10;regression-inventory.md §一/§二/§三

### BIZ-012: #27/#28 裁决族与 SC 裁撤

**Rule**: #27(UF4 feature 阶段感知裁撤,任务面板保持 M2/M3 看板独立形态,SC8 废止)/#26(启动首屏=工作台,独立项目列表页裁撤)/#28(原位换台重置)为 M4 期裁决,已落 PRD/盘点;后续里程碑不再复述。
**Scope**: [LOCAL]
**Source**: prd/prd-spec.md §In Scope 裁撤注记;regression-inventory.md §三

### BIZ-013: 顺延记账(开放项 A-F)

**Rule**: 20 技能归宿 → M6 收口期;quality-gate/cleanup/worktree/verify-task-done 四 CLI 动词 GUI 归宿 → M5/M6;影子 git + runtime_root ①② → 存储实现里程碑;偏好/插件面正式归宿与已归档会话恢复口径 → 开放项(过渡 = 逃生门 overview);板内「进入会话」toast 面、拆出失败 toast 面 → M6。
**Scope**: [LOCAL]
**Source**: regression-inventory.md §四;tech-design §Open Questions/§Appendix T7
**Target 注记**: 路线图层面的顺延同步修订 TECH-product-arch-004(见 tech-specs TECH-011);条目级记账留 feature。
