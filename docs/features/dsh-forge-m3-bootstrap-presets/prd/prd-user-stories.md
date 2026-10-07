---
feature: "dsh-forge M3：自举·模式预设（双预设 + 拆包 + 技能迁移 + 提案管线消费）"
---

# User Stories: dsh-forge M3：自举·模式预设（双预设 + 拆包 + 技能迁移 + 提案管线消费）

> 角色 derives from PRD Background：单人开发者（唯一人类用户）；dsh agent 会话为系统协作者（远征/突击用户主会话、dispatcher、worker——非用户故事角色，其行为经各 Story 的系统侧断言覆盖）。

## Story 1: 新会话选模式开工（双预设 + 自动对齐）

**As a** 单人开发者
**I want to** 新会话在 hero 一键选远征/突击模式（默认远征），从提案入口新建会话时自动对齐提案模式
**So that** 会话从第一步就带正确的工具与技能组合，不为逐会话手选错档买单

**Acceptance Criteria:**

- Given 应用首启完成（`ui-settings` 开关首启预置为开启）
- When 新建会话查看 hero
- Then 预设座位在场：折叠标签 = 远征模式（registry 默认），菜单列「远征模式 / 突击模式」（中文显示名直出、order 1/2）

- Given blank 会话（未发首回合）
- When 点选「突击模式」并发起首回合
- Then 会话工具面/技能目录与突击组合一致（投影断言）；首回合后座位不可再切换（blank 锁——再点选无效，UI 投影面断言）

- Given 某提案 mode 溯源 = blitz
- When 经提案/feature 绑定入口创建新会话
- Then 会话以突击模式起步（blank 期 `select`；座位标签 = 突击模式，工具面/技能目录与突击组合一致）

- Given hero 自由创建的会话（无提案上下文）
- When 该会话被用于另一模式的 feature
- Then 应用不阻断但给出可见性守卫（mode chip 对照 + 派发入口提示；平台 blank 锁边界如实记账，不伪装可切换）

---

## Story 2: 突击直达链（quick-tasks 一次成链到执行）

**As a** 单人开发者
**I want to** 突击会话里一句话发起 quick-tasks，直接得到提案 + 可派发的任务清单，一路跑到提交
**So that** 小需求不开全套 SDD 仪式也能走完整 gate 纪律

**Acceptance Criteria:**

- Given 突击会话与一个明确的小需求
- When 发起 quick-tasks
- Then 产出提案（五态 draft 起步，经 createProposal 落库）+ 任务清单（addTask；整数 ID / 无 stage-gate / eval 豁免——mode 溯源 = blitz 由创建技能写入，断言）

- Given 突击提案已 accepted
- When 任务域查看其归属
- Then **直接进入任务阶段**（任务直挂提案、即可 run-tasks 派发；**无 feature 行/文档域——断言**——突击只有提案与任务，用户裁决 2026-10-07）

- Given 任务就绪
- When run-tasks 派发至 submit 全绿
- Then 概览三视图在写入返回后单次重取即见新值（M2 即时口径回归）；全程突击会话技能清单不含任何规格技能（技能枚举断言）

---

## Story 3: 远征全链规格开发

**As a** 单人开发者
**I want to** 远征会话走 brainstorm → proposal → write-prd → ui-design / tech-design → breakdown-tasks 的完整 SDD 链，产出全部入自身状态层
**So that** 规格资产住进 forge.db 与 feature_documents，后续里程碑可回放、可消费

**Acceptance Criteria:**

- Given 远征会话与一个新方向
- When 依次走 brainstorm / write-prd / ui-design / tech-design / breakdown-tasks
- Then 全程经 tool 读写：文档入 feature_documents（upsertFeatureDoc）、任务入任务域（addTask）、提案入提案域（createProposal / transitionProposal）——零手工搬文件

- Given 远征会话查看技能目录
- Then 规格技能全集可见可用（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks / brainstorm）；core 包技能目录无 git-commit / git-checkout 条目（移除/未迁断言）

- Given 全链走完
- When 查看概览
- Then 提案/文档/任务/记录四域全景一致（e2e 一条链断言）

---

## Story 4: 提案评审流转与 mode 人工升降级

**As a** 单人开发者
**I want to** 在提案子 tab 按五态过滤、点文档跳转、做人工裁决（接受/打回/否决），并在目标膨胀时把突击提案升级为远征
**So that** 评审工作流有家，模式变更走唯一正门且不破坏在途任务

**Acceptance Criteria:**

- Given 库中存在多态提案
- When 打开概览提案子 tab 并点击某状态 chip
- Then 仅显示该态提案；提案行名称右侧 mode chip 与库中溯源字段一致；无溯源（扫描吸收的旧提案）显示缺省占位（断言）

- Given 人工与 agent 双面各流转一次（UI 裁决按钮 / transitionProposal tool）
- When 对比库中结果
- Then 两者写库一致（同门动词，断言）；agent tool 面无模式改写动词（契约断言）

- Given blitz 提案已建任务且在途
- When 在提案子 tab 手动改为远征
- Then 溯源字段即时同步（proposal ↔ feature 一致）；下一个经「打开新会话」入口创建的会话自动对齐远征；既有任务按创建时快照照旧执行（整数 ID / eval 豁免不变——断言）；既有会话按 blank 锁保持原预设

---

## Story 4A: 打开新会话带上现状（提案/feature 渠道）

**As a** 单人开发者
**I want to** 从提案或 feature 行头点「打开新会话」：自动切到对应模式（feature 固定远征），且新会话输入框预填该提案/feature 的现状上下文
**So that** 新会话从正确的模式与上下文起步，我只需补一句明确意图即可开工

**Acceptance Criteria:**

- Given 某提案 mode 溯源 = blitz
- When 点其行头「打开新会话」
- Then 新会话以突击模式起步（座位标签断言）；消息输入框**预填格式化上下文**（`@docs/proposals/<标识>/` 第一行 → 名称 → 摘要 → 状态 → 已生成文档真实路径清单；**不含模式**）且**不自动发送**——留「我的意图：」空位（断言）

- Given 某 feature（远征内容）
- When 点其行头「打开新会话」
- Then 新会话**固定切远征模式**；输入框预填 `@docs/features/<标识>/` 开头的同构上下文（含阶段与分层文档真实路径），同样不自动发送（断言）

- Given 任务子 tab 诊断失败 toast
- When 点「发送给 agent」
- Then 打开新会话并**自动发送**错误消息（检查项 + 任务键 + 修复指引——错误直达修复例外，断言）

- Given 任务子 tab 当前容器存在未处于终态的任务（待办/执行中/受阻/挂起）
- When 点工具栏「派发」按钮
- Then 按钮亮起可点（全部任务终态时置灰——断言）；当前容器存在正在执行的任务 → **跳转到对应的派发会话**（不新建会话、不重复发送——断言）；否则**新开一个派发会话**（模式 = 容器对应模式：feature → 远征 / 突击提案 → 突击）并**自动发送**派发指令——**「`/run-tasks <容器标识>`」单行最小消息**（只给 dispatchTask 必要信息 = contextSlug；不含所属/摘要/阶段/任务池快照/请求行——断言，v23）

- Given 任务子 tab 任意视图与任务详情
- When 查看任务行/详情动作区
- Then **无单任务直接执行入口**（不支持指定单个任务直接执行——必须按 DAG 依赖顺序领取执行，断言）

- Given 某任务状态 = blocked（如 fix 链源任务）
- When 展开其详情点「诊断失败」→「发送给 agent」
- Then 失败摘要 toast（状态 + 原因 + 最近记录 + 任务键，5s 自消）；发送 = 新会话**自动发送**格式化失败诊断（`@docs/features/<标识>/` + 任务键 + 失败记录 + 修复请求——断言；非失败任务无此按钮，断言）；**会话模式 = 任务容器对应模式**（feature 容器 → 远征 / 突击提案直挂任务 → 突击——断言，@path 相应指向 features/ 或 proposals/）

---

## Story 5: worker 拿到正确的工具与技能（供给收窄 + 默认 LLM）

**As a** 单人开发者
**I want to** 派发出的 worker 按任务类型带最小工具面、继承技能目录、并统一用我在 Forge设置 配的默认 LLM
**So that** worker 既能干活又不越权（不问用户、不派生子代），模型档位统一不随父会话漂移

**Acceptance Criteria:**

- Given Forge设置区块已配置 worker 默认 LLM 档位
- When run-tasks 派发任一 worker
- Then spawn 携带 agentOptions（provider / model / effort / output-token = 该档位，优先于父会话继承）；worker 会话 model 与配置一致（断言）

- Given 收窄矩阵（按任务类型族）
- When 派发 coding 族 / doc 族 / gate / 验证类任务
- Then worker tool 面仅含矩阵 ✓ 列工具（toolFilter 断言）；全局拒绝集（ask-user / delegation / todo / present）对所有 worker 生效；worker 携带 submitTask + addTask（claimTask / queryTask 不入）

- Given 远征默认会话派发 worker
- When worker 转录其技能目录
- Then 目录 = 组合继承目录（与父一致——spike 已实证同工具面/同目录通道）；测试任务实际加载 run-tests、非测试任务不加载（按需断言）；远征 worker 含 spec 技能行（内容不加载）、突击 worker 不含（预设级 L1 不破）

- Given worker 遇无法解决的重大问题
- When 经 addTask 追加任务
- Then 前缀按语义二分：disc-N（独立问题，不阻塞源）/ fix-N（走 fix 链协议——block_source 单事务、链深 ≤6、恢复钩子，M2 机制回归）；自身任务以 blocked 收尾并引用新任务

---

## Story 6: 规格技能物理隔离（L1 预设层）

**As a** 单人开发者
**I want to** 突击会话在物理上调不到规格技能（而非「被叮嘱不要」），且双预设镜像不随上游演进漂移
**So that** 模式边界靠机制不靠提示词纪律，升级 dsh 不悄悄破坏双预设

**Acceptance Criteria:**

- Given 突击会话
- When 枚举其技能目录
- Then 不含 write-prd 等规格技能全集（技能枚举断言——spike S6-3 已实证同构物理边界：突击目录物理缺 spec 探针）

- Given 两预设的 standard 基础行与上游 standard.patch.yml
- When 机械 diff
- Then 一致（契约面断言）；镜像行含必填 config 全集（缺 config → 整预设 broken 不上菜单——spike 教训入契约面清单义务）

- Given 预设行装配
- Then customSkillDirs 一律物化绝对路径（`!!js` 表达式形态禁用——spike 裁决全形态死刑）

---

## Story 7: gate 兜底与提交定式（AC 校验 + 提交规范）

**As a** 单人开发者
**I want to** 带 AC 的任务没有测试证据就提交不了，worker 提交带 commit_hash 且提交信息符合规范，gate 类任务产出数字摘要
**So that** 自举开发的每一步都有质检环，提交历史可审计

**Acceptance Criteria:**

- Given 任务带 AC 清单
- When worker submitTask 时缺测试证据
- Then 拒绝且错误信息含 AC 清单（功能断言）

- Given 配置了 AGENTS.md（含 commit 约定）与未配置两种态
- When worker 提交
- Then 两态分别断言：从其约定 / 回退模型常识级 Conventional Commits；submit 记录含 commit_hash

- Given gate 类型任务
- When 派发执行并提交
- Then gate_json 承载数字摘要落账；失败走 fix 链自动恢复（M2 机制回归断言）

---

## Story 8: 自举走查（M3.5 作为首个自举 feature）

**As a** 单人开发者
**I want to** M3.5 的评审接受直接触发走查：用远征会话在 dsh-forge 自身里开发 dsh-forge，全程零 manifest.md
**So that** 自举纪律从纸面变现实，飞轮第一批真实数据入库，M4 起全面自身开发

**Acceptance Criteria:**

- Given M3.5 提案评审 accepted
- When 走查启动（即 M3.5 立项启动）
- Then registerFeature 成链 → 远征会话派发开发 → 任务/执行记录 100% 入自身 forge.db（断言）

- Given 走查全链运行
- Then 概览三视图 / 文档 / 提案子 tab 全景一致；**全程零 manifest.md 生成**（文件系统断言）；总纲 SC2 / SC3 / SC7 回归断言绿

- Given 本里程碑收尾
- When 记账合入
- Then 顺延表 #1–#13 与总纲回写四条款合入总纲（文档断言，SC9）
