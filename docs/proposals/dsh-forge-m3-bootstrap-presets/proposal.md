---
created: "2026-10-07"
author: "faner"
status: Draft
intent: "new-feature"
---

# Proposal: dsh-forge M3 自举 · 模式预设（聚焦版：双预设 + 拆包 + 技能迁移 + 提案管线消费）

> **定位**：里程碑提案（P2 = M2–M3 收官；M2 里程碑级立项先例）。
>
> **宪法输入**：总纲 [dsh-forge-redesign/proposal.md](../dsh-forge-redesign/proposal.md)（工件版图出厂双预设 / 自举纪律「M4 起剩余功能用自身开发」/ 总纲 SC 池 M3 锚点「预设迁移设计验收 + 自举走查」）、M2 提案「范围对齐」顺延清单、M2 db-schema M3 交付标注、[tech-research.md](../dsh-forge-redesign/tech-research.md) §5、两份架构探索笔记（[插件架构探索](../dsh-forge-redesign/plugin-architecture-exploration.md) / [工作区替换探索](../dsh-forge-redesign/workspace-replacement-exploration.md)）。
>
> **主轴裁决（用户，2026-10-07 brainstorm）**：
>
> - 以**自举达成**为验收主轴，**远征/突击双预设为核心承载**。
> - 与主轴无关项**二次顺延并显式记账**（见 Out of Scope 顺延表——「本 M3 没有做的」全部记录在案）。
>
> **术语定名**：worker（执行子代理）/ dispatcher（派发会话）/ 用户主会话 / dispatchPrompt / mode 溯源（库内落位简称「溯源字段」）/ 组合继承目录（catalog 行级常驻、内容按需加载）。本提案 SC1–SC9 为本提案验收；引宪法池/M2 验收时一律冠「总纲 SC-N」。

## Problem

核心问题一句话：**dsh-forge 至 M2 为止仍不能用自己的管线开发自己**——模式预设不存在（新会话只有 dsh 出厂 standard）、规格技能未迁移（write-prd / breakdown-tasks 等仍住冻结旧线）、提案/feature/文档域无 agent tool 面（提案五态表 M2 仅承载 + 最小动词）、总纲自举纪律（M4 起剩余功能一律用自身开发）无从起动。

### Evidence

- **路表事实**：总纲演进路书 M3 行 = 「自举 · 模式预设」（出厂双预设 + plugin-forge 拆包 + brainstorm 共享 + M2 顺延项 + 自举达成）；M2 Out of Scope 明文「quick-tasks / consolidate-specs / 规格技能 = M3 随拆包与双预设」「proposals 管线完整消费 = M3 随预设」。
- **代码事实**：`packages/plugin-forge` 现有 tools = 任务域动词（add/query/claim/submit）+ create/transition-proposal 最小动词（M2 阶段 3 记录在案）；feature/文档域零 tool（db-schema §6-23④「技能经 tool 读写」的 M3 兑现义务）；技能清单无 write-prd / ui-design / tech-design / gen-\* / breakdown-tasks / quick-tasks（上游入口技能全部未迁）。
- **依赖事实**：[M3.5 提案](../dsh-forge-m3.5-knowledge-consolidation/proposal.md)（Draft 在库）硬前置 = M3 模式预设机制（其 Constraints & Dependencies 明文「M3 延期则本里程碑双入口退化为单入口 chip + 专用提示词注入，记账顺延」）。
- **dogfood 事实**：本仓日常开发已用 worktree（本提案即诞生于 `.forge/worktrees/redesign`）——顺延项 worktree 域的触发信号已在亮，但见 Out of Scope 裁决（二次顺延）。

### Urgency

- M2 收尾后若不立项 M3：M4 起的知识内核深化（P3 主战场，四个里程碑）只能继续用冻结旧线开发——自举纪律失约，飞轮第一批真实数据（任务/会话/抽取素材）继续后延，核心卖点（知识资产复利）的自我验证遥遥无期。
- M3.5 已 Draft 在库：其价值主张（自举开发期召回有货、老项目冷启动提取）整体 riding M3 预设机制；M3 不动则 M3.5 吃自己记账的降级路径，独立里程碑的立项理由塌一半。
- M2 实跑证据已可支撑 M3 设计（阶段 1–4 记录 + 4.gate 通过[2026-10-06]：每工作区库 / 动词 API / dispatchPrompt / tool 半身 / 技能壳 / UI 组件全绿）——M2 立项拆分时显式预期的「M3 brainstorm 吃 M2 实跑证据」安排，时机已到。

## Proposed Solution

一句话：**把「用 dsh-forge 开发 dsh-forge」所需的最小完备面装上，并用 M3.5 完成首次真实自举**。

### ① 预设基座

- **PRD 前 spike（已执行 2026-10-07，结论摘要——工件与全量证据见 [`spikes/`](spikes/)）**：
  - **S5 预设基座 dev 形态全绿**：insert + registry default + `select` 接线 + blank 锁（UI 面座位卸载）+ 重启投影全链成立；packaged 双形态被环境故障阻塞（renderer 空文档，主进程健康——非工件缺陷），处置待裁决（转 M3 实施期验证 or 补跑）。
  - **`!!js` 表达式全形态死刑（判决较 M2 3.4 更重）**：ESM-only exports 无 `./package.json` 子路径，**dev 形态即死**（ERR_PACKAGE_PATH_NOT_EXPORTED）——tech-research §5.6 底稿的 `!!js` 行在所有形态均不可用；**M3 装配裁决 = 宿主物化绝对路径**（boot overlay 注行时物化，或首启模板烘焙），packaged-js 负对照仅存确认价值。
  - **S6 技能供给 dev 形态全绿 + 两判决反转**：多根 rank 决胜（custom 300 胜 user 400）✓；L1 物理边界（突击目录物理缺 spec 技能）✓；**M2 残余反转——标准会话可见 plugin-forge 技能**（3.4 base 行 customSkillDirs 打点有效，「web 面 disabled 致无效」假设不成立，5.4 dogfood 预期正答）；**worker 继承机械面成立**（子会话裸 UUID + 工具面与父完全一致）；per-call `toolFilter` 源码核实不可达（见方案⑥落位修订）。
  - **镜像行配置重述义务（新教训）**：预设镜像行必须重述必填 config（如 `tool-fs-search` 缺 `sampleOverCapResults: false` → schema 拒绝 → 整预设 broken 不上菜单；诊断面 = 设置 → Agent 预设 roster「加载失败」）——契约面清单（NFR 上游锁步）须含 config 全集。
- **出厂双预设**：远征 `expedition`（默认，完整 SDD 管线）/ 突击 `blitz`（proposal 直达任务执行）；profile patch YAML 按 tech-research §5.6 底稿（brainstorm 行随方案②归并 plugin-forge——§5.5/§5.6 偏离注记随总纲回写记账）；customSkillDirs 装配 = **宿主物化绝对路径**（S5 裁决，见上）。
- **hero chip 门控前置（形态已裁决：候选 (a)，用户 2026-10-07）**：门控 = `ui-settings` 命名空间**单字段行**（config `{enabled: volatile boolean}`），持久化走 profile 补丁行（非 dshHome JSON）；**叠层 `ui-settings` 行 `enabled: true` 工厂开启 chips = 形态 (a)，spike 实证成立**；附带发现 = overlay 占有行期间 UI 开关保存被拒（「保存失败，请重试」）→ 行所有权规则（overlay 行 vs 用户运行时修改的让位语义）入 PRD 定义。
- **平台语义**：registry default 覆写 / hero chip order / blank 锁 / 恢复按 agentPreset 投影重建。
- **persona 铁律**：只谈作风，不谈角色与工具禁令。
- **两处解耦**（tech-research §5.4 照搬）：会话节奏 ≠ 功能溯源；确认门 ≠ 模式。

### ② brainstorm 双模式共享（用户裁决修订）

- brainstorm 技能**回归 plugin-forge 的 skills/ 目录**（取消原「提取独立 plugin-brainstorm 包」——标准模式退出后「第三类真实消费者」消失，架构基线 §4 沉淀判据不再命中）。
- 远征/突击经其 customSkillDirs 获得共享。
- **标准模式（dsh 出厂）不引入 brainstorm**；未来标准模式将引用外部技能 **grill-me**（未来注记，非本提案范围）。
- 总纲工件版图 brainstorm 条目随之修订（见「总纲回写记账」）。

### ③ plugin-forge 拆包（管线/规格轴，用户裁决）

- `plugin-forge`（管线核心，双模式共用）：quick-tasks / run-tasks / fix 链 / submit-task / run-tests / brainstorm（git 纪律技能分别处置——见方案④）。
- `plugin-forge-spec`（规格深化，仅远征组合）：write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks / eval 幸存者。
- **L1 物理边界双层**：
  - 预设层 = 包级隔离：突击组合不含 spec 插件行与 customSkillDirs 目录——突击会话字面上调不到 write-prd，而非「被叮嘱不要」；副产收益 = 突击会话省规格技能清单 token。
  - worker 层 = **tool 最小面收窄 + 技能组合继承目录**（详见方案⑥ worker 段）。
- 域归属轴（探索一）维持「现在不动」结论，留触发器（见 Out of Scope #6）。

### ④ 技能迁移（管线 + 规格面）+ 状态层适配

- 迁移源 = 旧线（`Z:\project\ai\forge`）→ 迁入两包；内容适配新状态层，**经 tool 读写**（宪法 SC7 缝[总纲任务状态主链路]由任务域延伸至 feature/文档/提案域）。
- 文档产出（write-prd / tech-design / ui-design）→ upsertFeatureDoc；任务建立（breakdown-tasks / quick-tasks）→ addTask + registerFeature。
- eval 幸存者按 M3 形态裁剪（裁剪清单 = 技能迁移任务内定；完整 eval 体系不迁）。
- manifest.md 旧线工件随自举达成进入消亡倒计时（M3.5 起不再生成）。
- **执行面知识分层**（用户裁决 2026-10-07 修订；**自洽原则：forge 保持自洽，不需用户额外配置即可运行**；dispatchPrompt 仍不内嵌工具段或 skill 段——保持纯任务规格）：
  - **forge 自带层（又称自洽层，worker 技能承载）**：run-tests（surface 探测 → just 配方编排）与 submit-task（**非机械面**：任务完成情况总结、AC 通过与否评估、summary/reason 写作纪律——需 LLM 判断，无法机械化进工具）= **worker 消费技能**——经组合继承目录到达 worker（**catalog 行级常驻、内容按需加载**：模型仅在实际需要时加载全文，非测试任务不加载 run-tests；「仅测试任务可见目录」需 per-spawn 技能过滤 = 新机制 = 成本高 → 用户裁决接受 catalog 常驻形态）；M3 两技能**改写聚焦 LLM 判断面**（机械重复部分去弃——gate 序列 / 必带校验已在 submitTask 工具行为内）。
  - **机械层**：submitTask 参数语义（gate 内置 / 校验拒 / blocked 双径 / commit_hash 采集）→ 工具 schema 描述。
  - **可选用户层**：AGENTS.md = 用户自身项目约定（commit 风格 / 项目特有纪律）——**增益而非依赖**（缺省回退模型常识级 Conventional Commits）；不再作为 forge 执行知识的承载面（自洽原则修正）。
  - **任务规格层**：验收步骤 / AC = dispatchPrompt 任务规格的组成部分（任务内容，非工具段/skill 段）。
  - git-commit 技能**暂不迁入，未来再说**（用户裁决 2026-10-07；M2 已落地条目 M3 移除）——消费者清点归零（worker 提交纪律 = 可选用户层 + 模型常识兜底）；复活触发 = 真实消费者出现（如用户主会话直写代码场景），Out of Scope #12 记账。
  - git-checkout 技能**不迁移**（维持 M2 未迁现状）——单机单活跃分支基线下无日常消费；分支准备若需 = run-tasks 派发前序；复活时机 = worktree 域落地（Out of Scope #1 伴生，#11 记账）。
  - M2 3.3 装配缝（`Skill(forge:run-tests)` 前缀引用）消灭 → worker 直接经组合继承目录加载。
  - 代价记账：worker catalog 行级常驻（核心包技能行 + 远征 worker 的 spec 技能行——tech-research §5.2 已知代价在**行级粒度**接受，内容不加载）；换自洽（零用户配置）与内容按需。
- **排除**：知识沉淀类技能（consolidate-specs / learn 等）不随本提案迁移（用户裁决 2026-10-07——职责归属知识域，见 Out of Scope #7）。

### ⑤ 规格域 gate（db-schema 记账兑付）

- submitTask gate 增 **AC/测试证据校验**：带 AC 任务缺测试证据拒，错误信息含 AC 清单。
- **gate 任务类型**落地：quality-gate 退役的承接形态，gate_json 承载数字摘要。

### ⑥ 提案管线消费

- **tool 封装**：registerFeature / transitionFeature / upsertFeatureDoc 封 agent 面（M2 = core API + UI 直调）。
- **成链分叉（用户裁决 2026-10-07 UI 评审）**：**远征提案 accepted → registerFeature 单步成链**——feature 行 + proposal_id 谱系 + feature_records 审计行原子写入（db-schema §6-31 既定）；**突击提案 accepted → 直接进入任务阶段**（突击模式**没有 feature 阶段——只有提案与任务**；任务直挂提案，不建 feature 行/文档域）。
- **提案子 tab**（概览 dock）：
  - 五态 chips 过滤；提案行 = 标题 + **名称右侧 mode chip** + 状态 + **行头「打开新会话」**（切提案模式 + 现状上下文预填输入框不自动发送）+ 文档跳转（提案文档不固定——proposal.md 之外可挂任意文档）。
  - 人工裁决按钮（UI 直调既有 core 动词，与任务转移对话框同构）。
  - mode 人工更改入口（律三正门）。
- **feature 子 tab 升级（UI 评审 2026-10-07）**：阶段 chips 过滤（原「相位」更名）；展开元数据两列（标识[原 slug]/模式/谱系/阶段）；**分层文档**（中文分组名 + 相对 feature 目录真实路径）；行头「打开新会话」→ **固定切远征**（feature 固定远征模式）+ 上下文预填。
- **任务子 tab 诊断（UI 评审 2026-10-07）**：M2 全量复刻 + 「诊断」按钮（视图切换左侧同行；feature pill 语境）→ **toast 结果**（成功 1s 自消 / 失败 5s 自消 + 「发送给 agent」= 打开新会话自动发送错误消息）。
- **追溯矩阵 → M3.75（用户裁决 2026-10-07，非弹性项而是定去向）**：feature↔文档↔任务↔记录谱系视图移出 M3 交付（Out of Scope #13 记账；形态设计期定——schema 依赖技能设计，db-schema §6-23② 既定；M3 只保数据面就绪 = feature_records + proposal_id 谱系，M3.75 立表即消费）。
- **validateFeatureTasks**：tool 封装 + UI 诊断入口（db-schema 面归属既定 M3）。

**提案 mode 溯源元数据**（远征/突击——tech-research §5.4① 溯源语义提案级落地）：

- 写入时机 = 创建时（所在会话预设 / 创建技能确立）。
- 落位设计期定：proposals 行加列（软迁移，DB 为 SoT 倾向）或 frontmatter 派生。
- 扫描吸收的无溯源旧提案 → chip 显示缺省占位。

**模式绑定三律**（用户裁决 2026-10-07）：

- **律一 · 新会话自动对齐**：proposal 选定模式后，经提案/feature 绑定入口创建的新会话（**用户主会话**）自动对齐提案模式，防逐会话手选错档。
  - 落位已源码核查 2026-10-07：app 侧创建 blank 会话 → `agentPreset.select` RPC（`packages/preset/agent-preset-registry/src/index.ts` `@Remote('select')`）——blank 期合法、`agent-preset/selected` 事件入日志、恢复按投影重建。
  - 边界：hero 自由创建的会话无提案上下文、不自动对齐——错配守卫 = mode chip 对照 + 派发入口提示（可见性而非阻断；平台 blank 锁后不可改，如实记账）。
- **律二 · 确立后不可切换**：agent tool 面不提供模式改写动词（决策人类、落笔机器）。
- **律三 · 唯一变更通道 = 提案子 tab 人工更改**：tech-research §5.1「突击目标膨胀 → 转远征」升级/降级的正门。**变更语义 = 快照不回溯**：溯源字段（proposal ↔ feature 同步）即时更新——供新会话对齐与全景展示；**任务级 mode 语义（localId 形态 / eval 门豁免 / 派发模板选择）在任务创建时固化，不随溯源变更回溯**——已建任务与在途 worker 照旧执行；既有会话按平台 blank 锁保持原预设。

**worker 管辖与供给**（worker = 执行子代理定名；用户裁决 2026-10-07）：

- **不属三律管辖**：派发链指定的是 worker 而非预设——worker 系统提示词按任务类型与内容**动态合成**（dispatchPrompt v3：人格段 + 任务规格一次性合成，db-schema §7-6 映射表）；角色身份唯一来自 dispatchPrompt（tech-research §5.3 铁律「executor 不采用预设身份」）；预设继承（`composeFrom`）仅携带模式**作风**，不承载任务规格——「worker 预设对齐」不构成需求（子代无预设覆写能力 = 背景事实而非缺口）。
- **mode 溯源供派发链下游语义**：tech-research §5.4①——整数 ID / eval 门豁免等读溯源不读预设。
- **供给经 dsh 既有能力体系（用户裁决 2026-10-07；spike 落位修订 2026-10-07）**：worker 是子代理，工具 / skill 装载完全走 dsh 既有能力体系——组合继承（`composeFrom`）+ per-spawn `toolFilter` + skill-filesystem 分层；**M3 零新装载机制**，收窄矩阵 = 既有机制的配置策略，不自建任何 worker 专属装载路径。**`toolFilter` 通道落位（spike 源码核实）**：模型面 subagent 工具的**每次调用参数不暴露 toolFilter**（仅行级 config）→ per-spawn 收窄的唯一可达通道 = **插件侧派发面**（run-tasks 经 in-process spawn 携带 `composition.toolFilter`——`child-agent.ts` `childCtx.tools.restrict` 通道）或预设级配置——收窄矩阵的携带者 = run-tasks 派发逻辑（本就归它），不经提示词嘱托模型自行收窄。
- **worker 默认 LLM 统一设置（用户裁决 2026-10-07，M3 落地）**：
  - 机制 = per-spawn `agentOptions`（`provider` / `model` / `reasoning effort` / `output-token` 上限——`subagent/src/types.ts:165`，两个 in-process provider 均声明该能力、请求字段覆盖合并于父 Agent 选项之上）——既有通道，零新装载机制。
  - 配置面 = **dsh 原生设置对话框「通用设置」下方新增「Forge设置」区块**：配置 worker 默认 LLM（统一档位，全部 worker 生效）。区块注入缝已源码核实：通用设置行注入 = `settings.general.item` slot、新分区 = `settings.section` slot（上游 `ui-settings-general`，README 明示「额外的通用设置行需要相应功能插件」）——产品 client 插件按 slot 注入，非 fork。
  - 派发携带 = run-tasks spawn 时统一以 `agentOptions` 携带默认 LLM；**显式指定（Forge设置 默认值）优先于父会话继承**（设计期硬规则——防默认档被父会话临时切模静默冲掉）。
  - **推进路线（未来注记，非本提案范围）：按任务类型指派特定 LLM**——增强 worker 专业性、提升任务完成质量；机制同通道零新增，待自举运行期积累「任务类型 × 模型能力」质量信号后启动（档位策略表届时随 db-schema §7-6 伴生裁决）。
- **供给 = tool 最小面 + 技能组合继承**（对 tech-research §5.2「远征 worker 背负规格技能清单 = 既定取舍」的**部分推翻**——catalog 行级常驻、内容按需加载；显式记账偏离）：
  - tool 面：按任务类型收窄——per-spawn `toolFilter` 机制（`packages/subagent/subagent/src/child-agent.ts` `childCtx.tools.restrict(composition.toolFilter)`；**携带者 = run-tasks 派发面 in-process spawn**，模型面调用参数不可达——spike 落位修订，见供给段）；收窄矩阵底稿如下，终稿随 db-schema §7-6 映射表对齐（TaskType = 20 值已定稿）。

    **worker 收窄矩阵底稿**（任务类型族 × 工具；✓ = 携带，— = 拒绝）：

    | 任务类型族（TaskType 细目按 db-schema §7-6 定稿 20 值对齐；若需 spike 型则显式记 TaskType 扩值 = 修订定稿） | fs 读写 | fs 搜索 | shell（含 git） | jobs（长跑测试） | read_image | web | forge 工具（submitTask + addTask） |
    |---|---|---|---|---|---|---|---|
    | coding 族（feature / enhancement / refactor / cleanup / fix / test 脚本） | ✓ | ✓ | ✓ | ✓ | ✓（UI 断言截图） | — | ✓ |
    | doc 族（文档撰写） | ✓ | ✓ | ✓（提交定式统一——doc 产出亦为仓库变更） | — | — | — | ✓ |
    | gate（阶段门） | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
    | 验证类族（§7-6 词汇内选取；spike 型需扩值记账） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

    - **全局拒绝（所有 worker）**：`ask-user`（卡住即 submit blocked + reason，经 dispatcher/fix 链中转，不直连用户）、delegation/spawn（不派生子代）、`todo`（单任务作用域）、`present`。**`skill` 不在拒绝清单**——worker 经组合继承获得技能目录，内容按需加载（见 skill 面）。
    - **forge 工具面**（用户裁决 2026-10-07；工具名 camelCase，db-schema §6-25 定名）：worker 携带 `submitTask` + `addTask`——submit 自提交结果（db-schema §6-24④：submit 记 executor 子会话）；**addTask = 重大问题逃生通道**：worker 遇无法解决的重大问题时动态追加任务，前缀按语义二分（db-schema §6-35⑦ localId 混合分配既定）——**disc-N** = 执行中发现的独立问题（不阻塞源）；**fix-N** = 自身失败可修，走 fix 链协议（`addTask{source_slug, source_local_id, block_source: true}` → fix-N 前缀 + fix-chain 边 + 源同事务置 blocked、链深 ≤6、恢复钩子自动还原——M2 3.3 既定）。追加后自身任务以 blocked 收尾（fix-N 经 block_source 同事务、disc-N 经 submit blocked + reason 引用新任务），新任务经 dispatcher 正常派发。`claimTask` 归 dispatcher（dispatchPrompt 内聚）、`queryTask` 不入（规格全量内嵌，worker 不漫游任务域）。
    - **worker 提交代码**（用户裁决 2026-10-07）：定式 = 代码 → gate 自检（测试任务经 run-tests 技能加载配方；其余 = 任务 AC）→ commit（规范 = AGENTS.md 可选用户层，缺省回退模型常识级 Conventional Commits）→ submitTask 携 gate_json + commit_hash；**summary = 非机械数据**（任务完成情况总结 / AC 通过评估——LLM 判断，纪律经 submit-task 技能承载）。dispatchPrompt 不内嵌工具段或 skill 段（纯任务规格）。
  - skill 面：**组合继承目录（catalog 行级常驻、内容按需加载）**（用户裁决 2026-10-07 自洽修订）——run-tests / submit-task 为 worker 消费技能（加载时机 = 任务实际需要，如测试任务加载 run-tests）；突击 worker 目录不含 spec 技能（预设级 L1 隔离不破）；执行知识通道 = forge 自带技能（自洽层）+ 工具描述（机械层）+ AGENTS.md（可选用户层）+ 任务 AC（见方案④执行面知识分层）。
  - 边界：按 worker 粒度精选技能无平台机制（skill 注册表分层粒度 = 预设级）。

### ⑦ feature_records 第八表

- **形态**：软迁移新表 + append-only 双触发器审计（register/transition/doc-upsert 每次写入伴随审计行）——与 task_records 同构（verb = 事件名、记真实动词不记推导机重算、actor = plugin-tool/ui/core；UPDATE/DELETE 直接 ABORT）。
- **消费方**：SC6 表断言（动词↔审计行伴随）；自举走查考古（SC8——首个自举 feature 生命周期可回放）；M4+ 动词面统计（与 task_records 读侧同构）；M3.75 追溯矩阵的 feature 侧时间线（谱系数据面 M3 就绪、视图 M3.75 消费——用户裁决 2026-10-07）。
- **作用**：feature 域生命周期事件日志——没有它，每次状态转移都是「行静默变更」；M3 feature/文档域 tool 封装使 agent 写入成为常态后，审计 = 单写路径纪律的必要见证。闭合 M2 已记账的「feature 域转移无审计」缺口。

### ⑧ 自举达成与走查（SC-M3 门）

- 自举纪律生效：自 M4 起 dsh-forge 剩余功能一律用自身开发（提案/任务/执行记录入住自身状态层，开发会话在自身中区）。
- 走查对象 = **M3.5 作为首个自举 feature**（用户裁决）：提案评审接受（吃五态消费链）→ registerFeature 成链 → 远征会话派发 → 任务/记录入自身 forge.db → 全景可见。
- 走查即 M3.5 立项启动，飞轮第一批真实数据。

### ⑨ 路书与总纲回写记账

- 演进路书 M3 行收窄为聚焦版 + 全量顺延表（#1–#13）入路书。
- 工件版图 brainstorm 条目修订；M3.5 时序耦合注记；tech-research 偏离注记。
- 明细见「总纲回写记账」节。

### Innovation Highlights

诚实说明：**无新创新主张**。

- ① 双预设 = dsh 平台预设机制（agent-preset registry / patch 方言 / blank 锁）的直接应用，tech-research §1.2 已源码核实；差异点仅在 **L1 物理边界**——技能按包隔离 + customSkillDirs 载体，物理不可见优于提示词禁令（业界主流是提示词纪律）。
- ② 自举走查 = self-hosting/dogfooding 惯例（TypeScript / Rust 编译器自举先例）；差异点仅在选择**真实后续里程碑（M3.5）**作走查对象——用真活代替表演性玩具 feature，走查产物直接服务下一里程碑。
- ③ 提案五态消费 / 单步成链 / feature_records 审计 / gate 任务类型全部继承 M2 db-schema 既定裁决，零 schema 创新。

## Requirements Analysis

### Key Scenarios

1. **突击日常（happy）**：新会话 hero chip 选突击 → quick-tasks 直接产出提案 + 任务清单（整数 ID / 无 stage-gate / eval 豁免——mode 溯源）→ 提案 accepted → **直接任务阶段（无 feature 行——用户裁决 2026-10-07 UI 评审）**→ run-tasks 派发执行 → submit（gate 纪律不折扣：单写路径 / 执行记录 / 提交规范 / 验证门原样）→ 概览三视图即时刷新；全程技能清单不含任何规格技能。
2. **远征全链（happy）**：brainstorm 结构化探索 → proposal.md → 提案发现扫描建行 → 提案子 tab 评审流转（draft → under-review → accepted）→ registerFeature 单步成链 → write-prd / ui-design / tech-design（文档经 upsertFeatureDoc 入 feature_documents）→ breakdown-tasks 建任务 → run-tasks 派发 → submit（AC gate）→ 三视图 / 文档 / 提案全景一致。
3. **提案评审流转**：五态 chips 过滤；人工裁决（UI 按钮）与 agent tool（transitionProposal）双面流转均可；打回修订（under-review → draft）；accepted → superseded 演进链可用。
4. **mode 溯源解耦边界**：远征会话打开既有突击 feature（mode 溯源 = blitz）→ 整数 ID / eval 豁免照旧生效（下游读溯源字段不读会话预设，tech-research §5.4①）。
5. **gate 边界**：带 AC 任务 submit 缺测试证据 → 拒（错误信息含 AC 清单）；gate 任务类型可被派发执行并写 gate_json；failures 走 fix 链自动恢复（M2 机制不动）。
6. **自举走查（M3.5）**：评审接受 → 成链 → 远征会话全链开发 → 任务/执行记录全部入自身 forge.db → 全景可见 → 全程零 manifest.md 生成 → 总纲 SC2 / SC3 / SC7 回归断言绿。
7. **模式升级/降级（人工正门）**：blitz 提案目标膨胀 → 用户在提案子 tab 手动改为远征 → 溯源字段（proposal↔feature 一致）即时更新 → 下一个新会话自动对齐远征；**既有任务按创建时 mode 快照照旧执行（语义不回溯）**；既有会话按 blank 锁保持原预设。
8. **失败/降级**：S5/S6 spike 失败 → 预设组合缩为最小 patch 形态或**宿主物化绝对路径**（吸收 M2 3.4：「目录清单静态化」路线已判不可行；fallback 记账，不阻塞技能迁移主体）——**spike 已执行（2026-10-07 dev 全绿），本支未触发，留档降级路径**；blitz 会话请求规格技能 → 物理不可见（技能枚举断言即证——S6 已实证）。

### Non-Functional Requirements

- token 纪律：突击组合省下规格技能清单 token（拆包副产收益）；worker catalog 行级常驻、内容按需加载（run-tests 等仅实际需要时加载）；技能描述行保持一句级。
- 上游锁步：dsh 0.x-rc `next` 线精确锁定；双预设镜像的 standard 基础行演进经契约面清单 + 机械 diff 跟踪（tech-research §5.2③）；**契约面清单须含行 config 全集**（S5 教训：镜像行缺必填 config——如 `tool-fs-search` 的 `sampleOverCapResults`——→ schema 拒绝 → 整预设 broken 不上菜单）。
- 宪法池回归：总纲 SC2（无投影）/ 总纲 SC3（只读边界）随自举走查复跑；宪法 SC7 断言对象延伸至 feature/文档/提案域 tool 读写。
- G0–G2 测试门全绿；里程碑节奏 = 路书 1–2 周基线 + M3 显式记账溢出（估 2.5–3 周，弹性项见 Timeline）。

### Constraints & Dependencies

- **硬前置 = M2 收尾**（仅剩阶段 5：测试主径与门 5.1–5.4——3.4/3.6 与 4.gate 记录已在库[2026-10-06]）——M3 PRD 可先行起草，任务执行在 M2 全绿后。
- **S5/S6 = PRD 前 spike（已执行 2026-10-07，dev 形态；全量证据与判定物对账见 [`spikes/`](spikes/) 两文档）**：结论已回填本提案（方案①/⑥）与 PRD；预设 YAML 底稿的 dev 形态已验，未验项显式记账如下。
  - S5 已验：insert + registry default + `select` 接线（点选→标签投影→m3_probe 工具面 dump 全链）+ blank 锁（首回合后座位卸载 = UI 面）+ 重启投影重建 + hero 门控（`ui-settings` 行工厂开启 = 候选 (a) 机制成立）。**口径修正**：会话日志运行期不落盘、closeApp 后亦未检索到 `agent-preset/selected` → select 断言基 **UI 投影面**（座位标签/工具面/目录），日志事件降为证据级（SC1 断言口径随 PRD 采纳）。
  - S5 未验（环境故障阻塞——新建 Electron 启动 renderer 空文档、主进程健康，机器状态漂移非工件缺陷）：dev-abs / dev-tf / packaged-js / packaged-abs 四形态。packaged exe 手动 spawn 的启动健康已单独取证（profile 物化 created=4、壳窗口就绪）；且试验床为 pre-M2-3.4 构建（runtime 无 plugin-forge），packaged-abs 即使跑通对生产形态证明力有限。**处置已裁决（用户 2026-10-07）：转 M3 实施期首任务补验**（dev 证据已覆盖全部 PRD 判定，四形态为确认性质）。
  - S6 已验：多根 + rank 决胜 + L1 物理边界 + 标准模式可见性（M2 残余**反转**：base 行 customSkillDirs 打点有效）+ worker 继承机械面（子会话裸 UUID + 同工具面）。
  - S6 未验：per-spawn `toolFilter` 行级 deny 实跑（dev-tf，deny 名单已据 main-blitz 工具面备好）——**源码结论已独立成立**（per-call 不可达、行级可达），实跑仅为确认；AGENTS.md 基线消息到达 worker 的 relay 文本（工具面/会话 id 已证继承，仅叙述性文本缺口）；run-tests 按需加载的会话日志事件面（日志不落盘同 S5 口径约束）。
- **M3.5 提案须处于可评审状态**（已 Draft 在库）；走查时点 = 其评审接受之时（时序耦合记账）。
- **宪法修订记账义务**：工件版图 brainstorm 条目 + 演进路书 M3 行收窄，随本提案定稿执行显式修宪流程（M2 裁决②回写先例）。
- 技能源 = 冻结旧线 `Z:\project\ai\forge`（迁移改造面）+ 本仓既有技能资产。

## Alternatives & Industry Benchmarking

### Industry Solutions

- 模式/节奏切换：Claude Code permission/plan 模式、Aider architect/edit 模式——业界主流 = 会话级模式开关 + 提示词纪律约束行为（本提案改用物理边界）。
- 自举/self-hosting：TypeScript / Rust 编译器自举、Bazel building Bazel——惯例 = 渐进切换 + 用真实工件验证（本提案同构，走查对象选真实里程碑）。
- 需求/提案状态流转：Linear / GitHub Projects 状态机 + 评审队列——本提案的五态承载与人工/agent 双面流转为常规形态。

### Comparison Table

| Approach | Source | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| Do nothing（暂不立项 M3） | — | 零投入 | 自举失约；M4 知识内核继续住冻结旧线；M3.5 吃降级路径（单入口 chip + 专用提示词）；核心卖点自我验证无限后延 | Rejected: 自举链路断根，M2 建立的管线无第一批真实用户 |
| 路表全量 M3（worktree 族等全部塞入） | 总纲路书原行 | 一站清偿 M2 顺延债 | 3–4 周体量，重蹈 M2 范围膨胀（M2 正是被「范围对齐」救回 1–2 周节奏）；与自举主轴无关 | Rejected: 违反溢出显式记账纪律 |
| 纯工具链自举（无预设产品化） | 最小工具面方案 | 体量最小 | 双预设是总纲工件版图承诺 + M3.5 硬前置 + 自举开发的节奏载体（远征/突击是真实开发节奏，非装饰） | Rejected: 省的不是冗余是主轴 |
| 域归属轴拆包一步到位 | 探索一（插件自有域） | 自举叙事更真、插件可独立发布 | 五条缝（存储所有权/UI↔插件服务/面板贡献/生命周期/读路径）+ 中央库拆分，体量爆炸；探索结论「方向成立、现在不动」 | Rejected: 迁移路径平滑（包内重构，tools/skills 契约面不变），触发器未亮 |
| **聚焦版（本提案）** | 主轴裁决的直推 | 自举+预设最小完备；二次顺延显式记账；riding M2 全部已验证机制 | 走查依赖 M3.5 时序；技能迁移体量仍属最大单项 | **Selected: 主轴（用户裁决）+ 范围裁剪（用户裁决）+ 既有设计定稿（tech-research §5 / db-schema）的忠实收敛** |

## Feasibility Assessment

### Technical Feasibility

- 全部 riding 已验证机制：tool 注册 / RPC / 写推送事件桥（M2 阶段 1–4 实跑记录）、dsh 预设机制（tech-research §1.2 源码核实 + **S5/S6 dev 形态实跑全绿 2026-10-07**：registry patch / insert 方言 / blank 锁 / agentPreset 投影 / customSkillDirs 多根 rank / worker 继承）、双预设 YAML 底稿（§5.6 的 `!!js` 行已判全形态死刑——**装配 = 宿主物化绝对路径**，S5 裁决）。
- 残余未验 = packaged 双形态 + dev-abs/dev-tf（环境故障阻塞，处置待裁决——见 Constraints；机制面已有 dev 实证 + packaged 启动健康 + M2 3.4 overlay 机制三重背书，降级形态（场景 8）未被触发）。
- 技能迁移是工程量主项但无技术风险（改读写对象：文件 → tool）。
- 三路 subagent 评审（2026-10-07，见文末评审记录）：全部机制声称经上游源码逐行复核为真，M2 衔接零断裂。

### Resource & Timeline

单人估 **2.5–3 周**（超路书 1–2 周基线 = 显式记账；对照 M3.5 复估先例[首估漏三成]本估已单列 UI 与断言面）：

- S5/S6 spike（dev + packaged 双形态）~0.3 周；
- 拆包 + 双预设 + Developer tools 门控前置 ~0.5 周；
- 技能迁移与状态层适配（含 run-tests / submit-task 改写）~0.5 周；
- 提案消费 + gate + feature_records ~0.5 周；
- UI 两面（提案子 tab / Forge设置区块）~0.4 周；
- 自举走查 + 回写记账 ~0.25 周；
- SC1–SC9 断言 e2e 面 ~0.25 周。

**弹性与去向（2026-10-07 裁决更新）**：追溯矩阵已**定去向 M3.75**（非弹性项——Out of Scope #13）；Forge设置区块**保留 M3**（用户裁决；不再列降级弹性项）。体量较原估收窄，与 M2（29 任务）同档。

### Dependency Readiness

M2 仅剩阶段 5（测试主径与门）；M3.5 Draft 在库；dsh `next` 线版本与 patch 方言已知（tech-research §1.2 核实 + §5.6 底稿）；旧线技能资产可访问。

## Assumptions Challenged

| Assumption | Challenge Tool | Finding |
|------------|---------------|---------|
| M3 主轴 = 自举·模式预设并列（路表标题） | 5 Whys（验收主轴决定取舍标准） | Confirmed（用户裁决）: 自举达成为主轴，**且双预设为核心承载**（并列不偏废） |
| worktree 项目域应随 M3 落地（M2 范围对齐塞入） | Need Gate / Why now（与自举主轴无关） | Overturned（用户裁决）: 二次顺延，显式记账 + 去向（独立小里程碑或随 M4）；触发信号（本仓已用 worktree 开发）已在亮 |
| brainstorm 三模式共享，标准模式经环境变量零 patch 获得（总纲工件版图 / tech-research §5.5） | Assumption Flip + 用户挑战 | Overturned（用户裁决）: **标准模式不引入 brainstorm**；提取独立包的动机（第三类真实消费者）消失 → 回归 plugin-forge skills/ 双模式共享；未来标准模式引用外部技能 grill-me（未来注记）；总纲条款修订记账 |
| 拆包轴待重估：域归属轴 vs 管线/规格轴（探索笔记重估点） | 事实核查（探索结论「现在不动」）+ Need Gate | Confirmed: 管线/规格轴（用户裁决）——直接服务预设 L1 物理边界；域归属轴留触发器 |
| 自举走查需要构造玩具 feature | Occam / 更简替代（M3.5 已 Draft 且硬依赖 M3） | Refined（用户裁决）: M3.5 = 首个自举 feature，走查即其立项启动——真活替代表演 |
| gate 增强（AC 校验 / gate 任务类型）可顺延 | Stress Test（自举开发自身需要质检环吗） | Overturned: 进 M3（用户裁决）——技能迁移了但 gate 不配套，自举开发就缺质检环 |
| 提案消费无需独立 UI 面（纯 tool 链即可） | Stress Test（走查评审时用户看什么） | Refined（用户裁决）: 概览 tab 内提案子 tab——评审工作流有家，走查可断言 |
| S5/S6 作为 M3 首阶段任务（排期确定性优先） | M2 先例对照（S8/S9①/S10 = PRD 前） | Refined（用户裁决）: PRD 前 spike——底稿未验不进 PRD |
| consolidate-specs 应随核心包迁移（tech-research §5.2 组合表原列） | 用户挑战（技能职责归属——知识沉淀类归知识域） | Refined（用户裁决）: consolidate-specs / learn 等知识沉淀类技能**不纳入本提案**，去向 M3.5 或 M4（Out of Scope #7 显式记账；tech-research §5.2 偏离同记） |
| 自动对齐落位三候选（hero 预选 / 会话创建指定 / 派发链指定）均未验 | 事实核查（dsh 源码 2026-10-07）+ 用户裁决 | Refined: hero 预选**不可行**（registry `defaultId` 全局单值，无按上下文钩子）；派发链指定预设**非需求**（用户裁决：派发链指定 worker，worker 系统提示词按任务类型与内容动态合成——dispatchPrompt 为角色唯一来源，预设继承仅携带作风）；**可行且充分 = 提案绑定入口创建 blank 会话 + `agentPreset.select` RPC**（用户主会话层；blank 期合法、事件入日志）；hero 自由会话错配降级为可见性守卫（平台 blank 锁边界如实记账） |
| 远征 worker 背负规格技能清单 token 开销 = 组合继承既定取舍（tech-research §5.2/§5.3 已知代价条款） | 用户裁决 + 源码核查（2026-10-07） | Overturned: **worker 最小面供给**——tool 面按任务类型 `toolFilter` 收窄（`child-agent.ts` `tools.restrict` 现成机制）；按 worker 粒度精选技能无平台机制（分层粒度 = 预设级）如实记账；§5.2 已知代价条款废止（**skill 面 deny 表述经下行自洽修订推翻——组合继承替代；toolFilter 收窄结论不变**） |
| git-commit / git-checkout 应作为技能存在（M2 已迁 git-commit；旧线命令组成员） | Need Gate（消费者清点）+ 用户裁决（2026-10-07） | Overturned: git-commit **暂不迁入，未来再说**（M3 移除 M2 条目；worker = 唯一提交者、用户主会话不提交——条目零消费者；纪律分流 AGENTS.md + 工具描述）；git-checkout **不迁移**（单活跃分支无日常消费，复活随 worktree 域）；连带 submit-task / run-tests 的 worker 消费面分流（**「零技能」「消费面分流」表述经自洽修订推翻——两技能为 worker 消费技能；git-commit 零消费者结论不变**） |
| worker 供给需要新装载机制（tool/skill 配给面） | 事实核查（dsh 能力体系）+ 用户裁决（2026-10-07） | Confirmed: **零新机制**——worker 是子代理，工具 / skill 装载完全经 dsh 既有能力体系（组合继承 + per-spawn `toolFilter` + skill-filesystem 分层）；收窄矩阵 = 既有机制的配置策略 |
| worker 执行知识（提交规范 / 测试配方 / 工具用法）经 dispatchPrompt 内嵌（工具段 / skill 段） | 用户裁决（2026-10-07） | Overturned: **dispatchPrompt 不内嵌工具段或 skill 段**——保持纯任务规格（人格段 + XML 三标签）；执行知识通道三分 = 工具 schema 描述（用法纪律）+ AGENTS.md 项目约定链（commit 规范 / 测试配方，dsh-agent-instructions 注入）+ 任务 AC（验收步骤属任务内容）；AGENTS.md 到达 worker = S6 增补验证点 |
| worker 零技能 + AGENTS.md 承载执行知识（上行的通道三分） | 用户裁决（2026-10-07 自洽原则：forge 保持自洽，不需用户额外配置即可运行） | Overturned: run-tests / submit-task = **worker 消费技能**（组合继承目录、catalog 行级常驻、内容按需——非测试任务不加载 run-tests；条件目录需 per-spawn 技能过滤 = 新机制 = 成本高，接受常驻形态）；**submit-task 的非机械面**（完成总结 / AC 通过评估需 LLM 判断）经技能承载；AGENTS.md 降为可选用户层（增益非依赖，缺省回退模型常识）；预设级 L1 隔离不破（突击 worker 仍无 spec 技能） |

## Scope

### In Scope

1. **预设基座**：S5/S6 PRD 前 spike（**已执行 2026-10-07，dev 全绿**；packaged 双形态残余处置见 Constraints）；出厂双预设（远征默认 / 突击）profile patch YAML + registry default 覆写 + persona 铁律 + blank 锁 / 恢复投影语义；hero chip 门控前置（`ui-settings` 行 `enabled: true` 工厂开启——spike 实证候选 (a)，行所有权规则 PRD 定形态）；tech-research §5.4 两处解耦（节奏 ≠ 溯源、确认门 ≠ 模式）；预设迁移设计验收（SC1–SC3）。
2. **brainstorm 双模式共享**：回归 plugin-forge skills/；两预设 customSkillDirs 含 plugin-forge 目录即得；标准模式零动作（不引入）；总纲工件版图条款修订记账。
3. **plugin-forge 拆包（管线/规格轴）**：plugin-forge（管线核心）/ plugin-forge-spec（规格深化）两包；L1 物理边界**双层**——预设层 = 突击组合不含 spec 插件行与 customSkillDirs 目录；worker 层 = **tool 最小面收窄 + 技能组合继承目录**（详见方案⑥ worker 段）；**worker 默认 LLM 统一设置**（设置对话框新增「Forge设置」区块——通用设置下方，经 `settings.general.item` / `settings.section` slot 注入；`agentOptions` 既有通道统一携带）。
4. **技能迁移（管线 + 规格面）+ 状态层适配**：quick-tasks → 核心包；write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks / eval 幸存者（裁剪）→ spec 包；全部经 tool 读写（宪法 SC7 缝延伸至 feature/文档/提案域）；**执行面知识分层**（run-tests / submit-task 改写为 worker 消费技能——自洽层；git-commit 暂不迁入[M2 条目 M3 移除]；dispatchPrompt 不内嵌工具段或 skill 段，见方案④）；**consolidate-specs / learn 等知识沉淀类技能除外**（Out of Scope #7）。
5. **规格域 gate**：submitTask AC/测试证据校验 + gate 任务类型（gate_json 承载）。
6. **提案管线消费**：feature/文档域 tool 封装；**远征 accepted → registerFeature 单步成链；突击 accepted → 直接任务阶段（无 feature 行——UI 评审裁决）**；概览提案子 tab（五态 chips + 名称右侧 mode chip + 行头「打开新会话」+ 文档跳转 + 人工裁决按钮 + mode 人工更改入口）+ feature 子 tab 升级（阶段过滤 + 分层文档 + 打开新会话→远征）+ 任务子 tab 诊断（toast + 发送给 agent）；提案 mode 溯源元数据与**模式绑定三律**（新会话自动对齐 / 确立后不可切换 / 唯一变更通道 = 提案子 tab 人工操作 + 任务级快照不回溯）；validateFeatureTasks tool 封装 + 任务子 tab 诊断入口（worker 供给归 InScope-3，不在此双列；追溯矩阵已移出 → Out of Scope #13）。
7. **feature_records 第八表**：软迁移新表 + append-only 双触发器审计；feature 域动词全审计覆盖。
8. **自举达成与走查**：自举纪律生效（M4 起自身开发）；SC-M3 门 = M3.5 作为首个自举 feature 端到端走查（含总纲 SC2/SC3/SC7 回归复跑、manifest.md 零生成断言）。
9. **路书与总纲回写记账**：M3 行收窄 + 全量顺延表（#1–#13）+ 工件版图 brainstorm 修订 + M3.5 时序耦合注记 + tech-research 偏离注记，随定稿合入总纲。

### Out of Scope（二次顺延显式记账——「本 M3 没有做的」全清单）

| # | 未做项 | 原归属 | 去向 | 现状兜底 |
|---|--------|--------|------|----------|
| 1 | worktree 项目域整族：.git 判定器 / repo_root 分组 / 中央 repo_root_path 列 / 兄弟提示 / 项目树两级呈现（db-schema §7-16） | M2 范围对齐 → M3（一次顺延） | **二次顺延** → 独立小里程碑或随 M4（插队先例 P1.1 / M3.5；触发条件 = 多 worktree 自举开发成日常——本仓已用 worktree 开发，预计快） | 单工作区管线不受影响 |
| 2 | §6-37 分组实现面三选一（中央列 / 宿主叠加插件 A/B / 替换引擎 C1——出处 = [工作区替换探索](../dsh-forge-redesign/workspace-replacement-exploration.md) §5.3）+ SC1 左栏与宿主 client 插件关系（出处 = [插件架构探索](../dsh-forge-redesign/plugin-architecture-exploration.md) §2.4） | 探索笔记重估点 → M3 一并裁决 | 随上项同去（届时裁决） | 未裁无碍——分组消费面尚未存在 |
| 3 | 总纲 SC6④ 会话头部执行上下文展示（当前分支/worktree） | M2 范围对齐 → M3 | 二次顺延，随 worktree 族（届时可裁剪为仅分支展示，不依赖判定器） | M2 会话头挂接 pill 不受影响 |
| 4 | task_records 的 branch / worktree 两列 | M2 范围对齐 → M3 | 二次顺延，随 worktree 族 | M2 记录形态不变（append-only 加列路径仍开放） |
| 5 | 移动找回认领对话框（F10-①） | M2 范围对齐 → M3 | 二次顺延（UI 边角） | M2 = 拒绝注册 + 手工指引兜底不变 |
| 6 | 拆包域归属轴（forge/knowledge 全域插件化） | 探索一重估点 | 留触发器（仓外独立发布决策 / 多 worktree 管线日常化） | 薄 tool 半身现状（探索结论「现在不动」；迁移路径平滑 = 包内重构） |
| 7 | **知识沉淀类技能迁移**（consolidate-specs / learn 等） | 旧线技能面；tech-research §5.2 组合表原列核心包（本提案修订偏离，显式记账） | **M3.5 或 M4**（去向随其提案裁决——与知识沉淀主题同族；用户裁决 2026-10-07） | 继续住冻结旧线（bug-fix only）；其下游消费语义（读 mode 溯源不读预设）经溯源字段保持兼容，届时迁移零阻碍 |
| 8 | 知识域全部（写入 tool / 沉淀模式 / 抽取 / 置信度） | M3.5 / M4–M7 | 各自里程碑 | — |
| 9 | 完整 eval 体系迁移（eval-proposal / eval-prd 等） | 旧线技能面 | 不迁——仅 eval 幸存者按 M3 形态裁剪（InScope-4 内定清单） | eval 门豁免语义经 mode 溯源保留 |
| 10 | 旧线 Claude Code 冻结插件退役时点 | P0 冻结策略 | 自举走查后自然切换（观察记账） | 冻结可用（bug-fix only） |
| 11 | git-checkout 技能迁移 | 旧线命令组（M2 四技能即未含） | 不迁移——单机单活跃分支基线无日常消费；分支准备 = run-tasks 派发前序；复活时机 = worktree 域落地（#1 伴生） | 现状即未迁移，零兜底需求 |
| 12 | git-commit 技能保留 | M2 已迁入（3.3 落地 SKILL.md） | **暂不迁入，未来再说**（用户裁决 2026-10-07）——M3 移除条目；复活触发 = 真实消费者出现（如用户主会话直写代码场景） | 纪律已分流：AGENTS.md 可选用户层（缺省回退模型常识级 Conventional Commits）+ submitTask 工具描述（commit_hash 参数语义）；旧线冻结件仍含该技能 |
| 13 | **追溯矩阵立表**（feature↔文档↔任务↔记录谱系视图——db-schema §6-23② 既定） | 本提案原 InScope-6（弹性项） | **M3.75 小里程碑**（用户裁决 2026-10-07——弹性裁决转为定去向） | M3 保数据面就绪：feature_records 第八表 + proposal_id 谱系 + mode 溯源字段全部落库，M3.75 立表即消费零迁移 |

### 总纲回写记账（宪法级条款修订，随本提案定稿执行）

1. **演进路书 M3 行收窄**：交付列改为本提案聚焦版九项；**全量顺延表（Out of Scope #1–#13）**与去向入路书记账。
2. **工件版图 brainstorm 条目修订**：「brainstorm 技能工件（结构化探索，三模式共享——标准模式经默认技能根零 patch 获得）」→「brainstorm 技能住 plugin-forge（双模式共享）；标准模式不引入，未来引用外部技能 grill-me（未来注记）」。
3. **M3.5 时序耦合注记**：M3 自举走查对象 = M3.5；其评审接受时点即走查启动。
4. **tech-research 偏离注记**：§5.5/§5.6 brainstorm 行归并（随条款 2）；§5.2 组合表 consolidate-specs 移出（#7）；§5.2/§5.3「远征 worker 背负规格技能清单」既定取舍部分推翻（方案⑥——catalog 行级接受、内容按需）。

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ~~S5/S6 spike 失败~~（**已执行 2026-10-07：dev 形态全绿，风险大幅收敛**；残余 = packaged 双形态受环境故障阻塞未跑） | L（残余 M：packaged 形态待验） | H | dev 实证 + packaged exe 启动健康取证 + M2 3.4 overlay 机制三重背书；装配裁决已定（宿主物化绝对路径——`!!js` 全形态死刑）；残余处置 = M3 实施期首任务补验 packaged 形态 or 环境恢复后补跑（Constraints 记账） |
| hero chip 门控（`developerTools` 上游默认 false）未前置处置 → SC1 默认配置失败 | L | M | **形态已裁决（用户 2026-10-07，候选 (a)）**：`ui-settings` 行 `enabled: true` 经 profile 补丁工厂开启 chips（spike 实证）；行所有权规则（overlay 占有期间 UI 保存被拒 → 让位语义）入 PRD 定义 |
| 技能迁移体量（十余项技能适配状态层）超节奏 | M | M | 分批：走查最小集（quick-tasks / breakdown-tasks / run-tasks / submit-task——含 spec 包的 breakdown-tasks）先行可走查，规格技能按管线阶段分批；eval 仅迁幸存者；知识沉淀类已移出（Out of Scope #7） |
| 自举走查时序耦合（M3.5 变更 / 评审延期） | M | M | M3.5 已 Draft 在库，走查前冻结其范围；**兜底 = 走查对象降级为小型真实 feature**（真活优先；表演性玩具走查仅作最后手段——其被 Refined 的理由见 Assumptions） |
| 拆包后包间依赖漂移（spec 包消费核心包 tool 契约） | L | M | contracts 单源（既有 packages/contracts 模式）；两包 tool 面 pin 契约测试 |
| M2 收尾延期挤压 M3（M2 仅剩阶段 5：测试主径与门） | M | M | M3 PRD 起草与 M2 收尾并行；任务执行严格在 M2 全绿后；S5/S6 spike 可先行 |
| L1 边界被绕过（突击会话经其它通道拿到规格技能） | L | M | S6 spike 验证全局根与 customSkillDirs 并存语义；SC2 技能枚举断言为机械防线 |
| 模式自动对齐接线时序（select 晚于首回合 → `agent-preset/locked`）与 hero 自由会话错配（无提案上下文不可预对齐）——落位已源码核查 2026-10-07，残余仅接线与守卫 | L | M | 落位 = 提案/feature 绑定入口（app 会话编排能力 P1 已验）创建 blank 会话 + `select`（用户主会话层）；S5 增补验证点实跑接线；自由会话错配守卫 = chip 对照 + 派发入口提示（可见性而非阻断，平台边界如实记账） |
| worker 最小面收窄矩阵过严卡死执行（缺必要 tool / 执行知识通道不全） | M | M | 收窄矩阵底稿（方案⑥）逐任务类型走查、终稿随 db-schema §7-6；fix 链恢复路径例外白名单；run-tests / submit-task 技能与工具描述承载的执行知识对照旧线 executor（≈ worker 前身）所需纪律逐项核对；worker 误调 dispatcher 技能（如 run-tasks）= 实跑观察项（目录行级可见 ≠ 能力滥用，dispatchPrompt 角色限定兜底）；S6 spike 验证组合继承与按需加载实跑 |

## Success Criteria

- [ ] **SC1 双预设可用与平台语义**（前置：`developerTools` 门控开启——见方案①）：
  - hero chips 出现「远征模式 / 突击模式」（order 1/2，自带中文显示名直出）；registry 默认 = 远征（e2e）。
  - blank 锁生效（首轮后预设不可切换）；恢复/分叉会话按 agentPreset 投影重建同款组合（e2e 各一条）。
  - 自动对齐：经提案/feature 绑定入口创建的新会话自动对齐提案 mode（blank 期 `select`；**断言基 UI 投影面**——座位标签 = 目标模式 + 首回合工具面/技能目录与该预设组合一致；`agent-preset/selected` 事件降为证据级[S5 实测：会话日志运行期不落盘]，e2e）。
- [ ] **SC2 L1 物理边界（预设 + worker 双层）**：
  - 预设层：突击会话的技能清单不含 write-prd 等规格技能全集（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks——技能枚举断言）；远征会话全量可见且 brainstorm 可用；核心包技能目录无 git-commit 条目（暂不迁入移除断言）且无 git-checkout 条目（维持未迁断言）。
  - 契约面：两预设 standard 基础行与上游 standard.patch.yml 机械 diff 一致。
  - worker 层：派发产出的 worker 其 tool 面按任务类型收窄生效（toolFilter 断言）；技能目录 = 组合继承目录（**突击 worker 不见 spec 技能——预设级 L1 隔离断言**；远征 worker 含 spec 技能行、内容不加载）；测试任务 worker 按需加载 run-tests、非测试任务不加载（会话日志 skill 加载事件断言）；worker 会话 model 与「Forge设置」默认 LLM 一致（配置生效断言——agentOptions 显式携带 Forge设置 默认值，优先于父会话继承）。
- [ ] **SC3 mode 溯源解耦**：feature 的 mode 溯源字段（落位设计期定）由创建技能写入；proposal 与 feature 的 mode 溯源一致（成链继承或同源写入，断言）；远征会话打开突击 feature，突击语义（整数 ID / eval 门豁免）照旧生效（功能断言，tech-research §5.4①）；**mode 人工变更后：溯源字段即时一致（proposal↔feature），既有任务语义按创建时快照不回溯（断言）**。
- [ ] **SC4 突击直达链**：突击会话 quick-tasks 一次产出提案 + 任务清单（mode 溯源 = blitz）→ 提案 accepted → **直接任务阶段（无 feature 行——断言）**→ run-tasks 派发 → submit 全绿 → 概览三视图即时刷新（e2e；写推送通道复用 M2 机制）。
- [ ] **SC5 远征全链**：远征会话 brainstorm → proposal → write-prd → ui-design / tech-design → breakdown-tasks → run-tasks → submit 全程经 tool 读写（文档入 feature_documents、任务/记录入 forge.db），提案/文档/任务/记录四域在 UI 全景可见（e2e）。
- [ ] **SC6 提案五态流转与单步成链**：
  - 提案子 tab：五态 chips 过滤 + 文档跳转可用。
  - mode chip：提案行名称右侧展示溯源模式（远征/突击），与库中溯源字段一致；无溯源（扫描吸收的旧提案）显示缺省占位（断言）。
  - 模式不可变：mode 确立后唯一变更通道 = 提案子 tab 人工操作（变更后新会话对齐新值、既有任务快照不变，联动断言）；agent tool 面无模式改写动词（契约断言）。
  - 双面流转：人工裁决（UI）与 agent tool（transitionProposal）均写库一致。
  - 单步成链（**仅远征提案**）：accepted → registerFeature——feature 行 + proposal_id 谱系 + feature_records 审计行原子写入（断言）；**突击提案 accepted → 直接任务阶段（无 feature 行——断言；用户裁决 2026-10-07 UI 评审）**。
  - feature 审计：feature 域全部动词每次写入伴随 feature_records 审计行（表断言）。
- [ ] **SC7 规格域 gate 与提交定式**：带 AC 任务 submit 缺测试证据被拒且错误信息含 AC 清单（功能断言）；gate 任务类型可派发执行并写 gate_json；失败走 fix 链自动恢复（M2 机制回归）；worker 提交定式 = submit 记录含 commit_hash 且提交信息符合 Conventional Commits（配置 AGENTS.md 时从其约定——经 `dsh-agent-instructions` 到达 worker 会话；缺省回退模型常识——两态分别断言）。
- [ ] **SC8 自举走查（SC-M3 门）**：M3.5 作为首个自举 feature 端到端走查——
  - 提案评审接受 → 成链 → 远征会话派发开发；
  - 任务/执行记录 100% 入 dsh-forge 自身 forge.db；
  - 概览三视图 / 文档 / 提案子 tab 全景一致；
  - 全程零 manifest.md 生成（文件系统断言）；
  - 总纲 SC2 / SC3 / SC7 回归断言绿。
- [ ] **SC9 记账合入**：本提案 Out of Scope 顺延表（#1–#13 全量）与总纲回写四条款（M3 行收窄 + 全量顺延表 / brainstorm 条目修订 / M3.5 时序注记 / tech-research 偏离注记）合入总纲（文档断言）。

consistency_check_result:
  status: pass
  check_scope: 结构一致性（SC↔SC / SC↔InScope / InScope↔Out of Scope 双向可满足性 + 编号交叉引用）
  pairs_checked: 52
  conflicts_found: 0
  external_review: 2026-10-07 三路 subagent 评审（可行性[机制逐项源码复核] / 逻辑一致性 / 术语统一）——BLOCKER 1 + MAJOR 11 + MINOR 32，全数处置入本版

## Next Steps

> **收尾状态（2026-10-08，任务 5.3/5.4 记账）**：SC-M3 门走查已执行（任务 5.3，2026-10-08）——M3.5 自举走查 e2e（`e2e/specs/m3/dogfood-sc-m3.spec.ts`）：真实提案 UI 两步评审流转 → accepted → registerFeature 成链原子三行 → 远征会话 dispatchTask 派发开发自身（真实模型，4.8m 收敛）→ 任务/执行记录 100% 入自身 forge.db → 概览三视图 / 文档 / 提案子 tab 全景一致；**零 manifest.md 生成**（文件系统断言）+ 总纲 SC2 / SC3 / SC7 回归断言绿；508 测试全绿。证据 = [任务记录 5.3](../../features/dsh-forge-m3-bootstrap-presets/tasks/records/5.3-sc-m3-dogfood-walkthrough.md) + `e2e/fixtures/m3/README.md`（运行记录与环境备忘）。总纲回写四条款与本提案 Out of Scope 顺延表 #1–#13 已随任务 5.4 合入总纲（演进路书 M3 行收窄 + M3 顺延表）。

- **S5/S6 spike 已执行（2026-10-07，dev 全绿）**：结论已回填本提案（方案①/⑥ + Constraints + Risks + SC1 口径）；两项 PRD 前裁决已落定（用户 2026-10-07）：残余四形态 → M3 实施期首任务补验；hero 门控形态 → (a) `ui-settings` 配置行。
- **M2 收尾**（仅剩阶段 5 全绿）并行推进；随后走 `/write-prd`（输入 = 本提案[含 spike 结论] + tech-research §5 + db-schema M3 标注 + M2 实跑记录 + spikes/ 证据文档）。
- **M3.5 评审接受时点 = 自举走查启动**：其 proposal status 翻 accepted 即走查第一步（时序耦合已双向记账）。
