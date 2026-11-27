---
title: 工具可见性边界=预设组合行进出，不靠运行期拦截（restrict 创建期可见性声明除外）
summary: >-
  产品裁决：工具面收紧靠预设组合行进出（不携带=物理不可见），禁守卫/restrict **调用期拦截**复辟。2026-11-25 补边界：restrict
  作为创建期可见性声明（agent/created 落子 agent
  scope，工具从可见面消失）不在禁止范围——与裁决同旨，是包粒度内工具级区分的官方路径。判据：工具不在模型可见面 = 符合；可见但调用被拒 =
  违反。附全局保留面与仅猎头组合面清单正本。
keywords:
  - preset
  - toolFilter
  - 组合行
  - 物理隔离
  - 管理工具
  - restrict
  - 可见性边界
id: preset-row-tool-visibility-boundary
status: unconfirmed
version_ts: '2026-11-25T05:45:41.099Z'
updated: '2026-11-25T05:45:41.099Z'
type: decisions
supersedes: '2026-11-05T15:31:35.511Z'
slug_hint: preset-row-tool-visibility-boundary
---
# 提案：猎头管理工具预设面收紧——仅猎头模式组合可见

父提案：expert-headhunter-tools（95365c42，已收口 stabilized）。本提案源于其收口后用户实机发现：非猎头模式会话可见 8 枚管理工具。

## 背景与问题

expert-squad 的管理工具（recruit / update / enable / disable / list_experts / list_tools / list_skills / rename_expert）由全局实例经 `ctx.tools.register` 注册——官方语义「全局单实例注册即全局继承」，所有预设组合统一可见可用。headhunter 底稿注记（2026-11-01）记载了这一现状，但「仅限猎头使用」的产品预期落空：任何模式会话都能建档改名。

## 先例与判据

- **标准模式零 forge 面**（产品裁决 2026-10-09）：plugin-forge 行只进远征/突击预设组合、全局行废除——forge 工具对标准模式物理缺席。组合行进出 = 工具面边界，零运行期拦截机械。
- **突击 L1 物理隔离**（M3 spike 实证）：预设组合不携带 = 会话物理不可见。
- 本提案即同一机械套用到猎头管理工具：**收紧靠组合行进出，不靠守卫/restrict 运行期拦截**（后者曾以「守卫微件态」存在、已撤销——不复辟）。

## 裁决边界（2026-11-25 补充——用户确认）

本裁决禁的是**调用期拦截**：工具可见但每次调用时检查调用者身份、不符即拒（`tools.guard` 形态）。模型看得见、会尝试、再失败——浪费 token 且体验差，这是被撤销的「守卫微件态」。

**不在禁止范围**：`tools.restrict` 作为**创建期可见性声明**。restrict 是官方可见性机制（工具从模型可见面消失），在 `agent/created` 上落到子 agent scope，达成的是「物理不可见」——与「组合行不携带」同一效果，只是路径不同。

为何需要这条路径：官方工具包只导出整体 `apply`，preset 行只能整包装载（`read` 与 `write` 同包）。组合行进出做不到工具级区分；restrict 落子 scope 是该缺口上的官方可见性机制，使同一包内工具可按档案逐个区分（真机 2026-11-25：`write` 留 / `edit` 掩）。机制细节见 [tools-restrict-global-scope-preset](../../pitfalls/tools-restrict-global-scope-preset-20261125T054443144Z.md)。

判据：**工具在模型可见面里吗？** 不在 = 符合裁决（不管靠不挂行还是靠 restrict）；在但调用被拒 = 违反裁决。

## 全局保留 vs 仅猎头组合清单

### 全局保留（expert-squad 全局实例，各模式不受影响）

| 面 | 内容 | 全局理由 |
|---|---|---|
| web 路由 | connection 六路由（list/get/update/enable/disable/run-state + candidates）——专家团面板 | 面板是 UI 面，走 connection 不经工具面，任何模式可查看 |
| 服务键 | experts provide（ctx.experts 正门） | plugin-forge 派发链折叠专家档案消费（dispatch-core） |
| 委派工具 | delegate_expert | 委派执行是各模式主会话的面——猎头只荐不管派（猎头底稿 persona 明文） |
| 查询工具 | list_experts | 委派前置：指挥者 persona「先查后派」硬规则（先 list_experts 查清单再 delegate_expert）；roundtable 技能挑人；delegate_expert 参数描述引用 "see list_experts"（消费面核实 2026-11-01） |
| 状态域 | storage domain（启停持久层） | 启停状态跨模式单一事实源 |
| watcher | chokidar + fs/observed 双通道 | 档案热刷新服务全局快照 |
| 档案层 | registry / scan / frontmatter / store | 工具与服务键的共享实现面（hr 插件经服务键消费，不复制） |
| 技能挂载 | expert-squad skills/ 目录 | 2026-11-01 裁决：标准模式也挂 squad 技能（skill-filesystem 面，非工具面） |

### 仅猎头组合（expert-squad-hr 薄插件行，7 枚管理工具）

| 工具 | 职责 | 核实结论（2026-11-01） |
|---|---|---|
| recruit_expert | 寻访建档 | 消费面仅猎头 SOP + 「新专家唯一创建面」注记 |
| update_expert | 档案更新（来源保持写回） | 无提示词引用；面板编辑走 HTTP 路由面 |
| rename_expert | 三层迁移改名 | 本批新工具，猎头建档防撞名配套 |
| enable_expert / disable_expert | 启停 | 无提示词引用；面板启停走路由面；猎头预设 description 明文管「启停」 |
| list_tools | 全模式工具并集（白名单核销） | 用途即 recruit/update 白名单核销（猎头建档配套） |
| list_skills | 全模式技能并集（标签核销） | 同上 |

判断准则：**档案写径/配置核销的模型面工具进猎头组合；委派链（delegate + 前置查询）、UI 面、服务面留全局**。list_experts 虽同为查询工具，但它是委派链的前置步（指挥者「先查后派」硬规则消费方），与 delegate_expert 同进退留全局。

## 方案

**拆分注册面**（代码现状核实 2026-11-01，HEAD 37d1c6b9）：expert-squad 全局实例保留一切非工具面（面板路由、状态域、experts 服务键 provide、delegate_expert、watcher、档案层），**7 枚管理工具的注册剥离到组合专行**——仅 headhunter.patch.yml 组合携带：

- 新增薄插件 `expert-squad-hr`（独立包，plugin-portability 装配缝归属插件域）：唯一职责 = 注册 7 枚工具。实现面复用而非复制——peer 依赖 `@dsh-forge/expert-squad`，import 其 `createExpertTools` 工厂与 scan 层落点解析（resolveUserExpertsRoot / resolveCwdProjectExpertsRoot）；experts 服务经 `ctx.experts` 正门消费。取数面自足：`ctx.tools` / `ctx.skills` / `ctx.agentPresets` 三具名 inject（同 expert-squad 既有 inject 先例）。
- **EXPERT_TOOLS 常量拆分**（tools.ts 现为 8 枚一体）：全局实例仅注册 `list_experts`，hr 包注册其余 7 枚——工厂加包含过滤参数（或常量拆双集），防 list_experts 双注册撞名。
- headhunter.patch.yml 增 `expert-squad-hr` 组合行（行所有权 = 产品工件底稿，boot overlay 注行，同既有四底稿纪律）。
- staging（packaged 形态）：预设携带插件由 assemble 从底稿扫描 + 依赖闭包自动推导（materialize 既有裁决），新包随底稿行自动入装；**dev 形态需建 profile.dev junction**（AGENTS §2 junction 纪律——junction 绑目录）。
- 猎头底稿头注与 presets.test.ts 行集契约 pin 同步改写：新行属产品分叉行（FORKED_ROWS 族），HEADHUNTER_REMOVED_ROWS 语义不动。

## 后果（明示）

- 仅猎头模式会话可见可用 7 枚管理工具；其它模式（含标准模式指挥者会话）物理缺席——建档改名一律走猎头模式。
- `list_experts` 全局保留 = 猎头模式照常可用（全局层工具被所有预设组合继承）：猎头查重防撞名（SOP 步）与指挥者先查后派两个消费面同源满足。
- `list_tools` 本身也仅猎头可见；其返回值仍为全模式并集（读面不受可见性影响）。
- 专家团面板（web UI）走 connection 路由，不经工具面，各模式不受影响。

## 验收清单

- [ ] 非猎头预设会话（远征/突击/标准）工具面 7 枚物理缺席（scoped `schemas(scope)` 探针取证）
- [ ] 猎头预设会话 7 枚在场且实调可用（recruit/rename 真机回执）；list_experts / delegate_expert 全局在场回归
- [ ] 猎头会话 `list_tools` 并集含 7 枚新位自证（并集视图覆盖本 preset scope）
- [ ] delegate_expert 全局保留：非猎头模式委派面回归不变（roundtable / 指挥者先查后派不受影响）
- [ ] 标准模式零 forge 面回归不变（2026-10-09 裁决不回退）
- [ ] presets.test.ts 行集契约 pin 与 headhunter 底稿头注同步改写（FORKED_ROWS 族新行断言）
- [ ] packaged staging 自动入装（assemble 底稿扫描）+ dev 形态 junction 建立并可装载
- [ ] 质量门：pnpm lint（全量）/ 针对性 vitest / tsc 通过；expert-squad-hr 包版本随改动落
