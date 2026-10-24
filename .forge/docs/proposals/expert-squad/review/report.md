# 提案评审报告：expert-squad（专家团插件）

- 评审对象：`.forge/docs/proposals/expert-squad/proposal.md`（121 行，Draft）
- 评审方式：独立上下文，提案 + 官方源码（`Z:\project\github\deepseek-harness`）逐条核销；annotutor 先例目录与下游消费提案对照。
- 评审日期基准：提案 created 2026-07-14。

## 一、官方机制核销结果（评审四问 Q1 承重面）

| 提案断言（段落） | 官方源码证据 | 结论 |
|---|---|---|
| bundle 形态：`dsh.bundle.patch` + `dsh.client` + `exports["./client"]` + 空 `apply`（2.4） | `packages/boot/app-boot/src/profile.ts:61`（patch 声明校验）；`packages/client/ui-workspace/src/index.ts`（纯 UI 插件空 apply 先例）；`packages/client/modules`（dsh.client 扫描 + `/plugins` 伺服） | ✅ 属实 |
| `ctx.storage` 持久化栈（2.4） | `packages/storage/storage/src/index.ts`（storage hub）、`storage-domain`（schema 校验 KV domain，host 侧） | ✅ 属实 |
| continuable 派发走 `ctx.subagents.startContinuable()`（2.4） | `packages/subagent/subagent/src/index.ts:261`；`continuation.ts:173`（composition 携 persona/toolFilter）；`tool-subagent-control`（send_message/interrupt_agent）官方存在 | ✅ 属实 |
| 仅 in-process provider 支持 toolFilter，进程外硬拒（2.4） | `subagent-spawn-in-process/src/index.ts:46`、`subagent-fork-in-process/src/index.ts:68`（toolFilter: true）；`subagent/src/out-of-process.ts:61`、`subagent-acp:151`、`subagent-dsh-sdk`、claude-code/codex 均 `toolFilter: false` | ✅ 属实 |
| toolFilter 落地 = 子创建窗口 scoped `tools.restrict`，随 descriptor 持久化、续聊 reapplied（2.4） | `packages/subagent/subagent/src/child-agent.ts:218`（`childCtx.tools.restrict(composition.toolFilter)`）；`descriptor.ts:85-193`（toolFilter 持久化与校验）；`continuation.ts:447`（续聊重放 composition） | ✅ 属实 |
| persona 经子 scope `composition.persona` 注入；全局二次注册 `deployment:persona-prefix` 撞名抛错；子 scope 遮蔽为合法语义（2.5 钉死项） | `system-prompt/tests/system-prompt.spec.ts:115-116`（重复注册抛错）；`preset/persona/tests/persona.spec.ts:62`；`system-prompt/tests/scoped.spec.ts:33`（scoped 遮蔽合法）；`subagent/src/child-agent.ts:213`（子代理 scoped persona 段） | ✅ 属实 |
| systemPrompt 对孤立 `{{` 按字面 prose 放行（2.5 缝 1 引 `system-prompt/src/index.ts:271-274`） | `packages/core/system-prompt/src/index.ts:270-278`：「a lone `{{` without any later `}}` is literal prose」 | ✅ 引证行号与内容相符 |
| 目录扫描语义照抄 skill-filesystem：chokidar + 坏文件 warn（2.4） | `packages/skill/skill-filesystem/src/index.ts:17,432,492`（chokidar watch + `logger.warn` 单点跳过） | ✅ 属实 |
| Web 面经 `ui-slots` 槽位 register + `/plugins/` 路由伺服（2.4/2.6） | `docs/subsystems/slots.md:5`（`ctx.slots.register()`）；`packages/client/ui-slots`；`docs/subsystems/client-modules.md:5`（`/plugins` bundle 路由） | ✅ 属实 |
| 数据通道正门 = `ctx.connection.fetch.register`，rpc.handle/intercept 不可用（2.6/2.7） | `packages/client/connection/tests/fetch-routes.host.spec.ts:60-77`（`/api` 前缀与方法约束正门）；官方消费先例 `session-log-export/src/index.ts:87`、`file-upload/src/index.ts:73` | ✅ 属实 |
| 安装/启停走 plugin-manager `installBundle`/`setBundleEnabled`，peer 版本兼容门（2.4） | `packages/boot/plugin-manager/src/index.ts:443,462`；`tests/manager.spec.ts:1395`（incompatible 拒装） | ✅ 属实 |
| dsh-tool-subagent persona/toolFilter 为装载期静态 Config，一实例一份（2.4 复用裁定） | `packages/subagent/tool-subagent/src/index.ts:318,521`（Config 装载期校验并对每次委派透传同一份）；`tests/tool-subagent.spec.ts:673-702` | ✅ 属实，裁定理由成立 |
| annotutor 经验目录（2.7） | `Z:\project\dsh\annotutor\docs\{README.md, dsh-plugin-dev-guide.md, lessons/, reference/dsh-real-host-verification.md}` 均存在 | ✅ 引证真实 |

结论：**提案假设的全部官方机制经源码核销均真实存在，且语义描述与源码一致，无虚指。**

## 二、分级问题清单

### Blocker（0 条）

无。需求→方案→验收双向闭合；无需求覆盖洞；无虚假设；改动面收敛。

### Question（5 条，呈用户裁决时一并定）

- **Q1 委派 API 对「被禁用专家」的契约未定义**（提案 2.1/2.5 缝 2）：注册服务定义为「字符串键档案取用」，但档案被禁用后 `get`/派发 API 的行为（返回 absent、抛错、还是返回禁用态对象）提案未钉。下游 expert-squad-forge 提案验收 1 依赖「确定性降级」，其基础正是本插件这层契约。建议：tech-design 钉死取用 API 的三态语义（存在/禁用/不存在可区分）。
- **Q2「双向联动（对话创建 ↔ UI 向导弹出）」的官方通道未核销**（提案 2.6）：UI → 插件数据面已钉 `fetch.register`，但「UI 侧触发对话创建」走哪条官方缝（宿主侧代为 `startContinuable`？客户端 prompt 投递面？）提案未指名。这是验收 1「UI 派发入口」的承重假设，建议 tech-design 到 `client/modules` + connection 远端面核销后再定。
- **Q3 三层 root 的 project 层解析来源未说明**（提案 2.5 缝 2）：插件面向任意 dsh 应用，「project（工作区下）」依赖宿主工作区根概念；通用插件如何取当前工作区根（官方 workspace 机械 or 宿主注入）未写。建议 tech-design 核销 `ctx.workspace` 可用性并钉死无工作区环境（headless/sdk profile）下的降级行为。
- **Q4 插件状态存储的作用域粒度未定**（提案 2.5 缝 2「禁用状态按 origin + 档案键隔离存储」）：`ctx.storage` domain 是按 workspace 打开的（`storageDomain.open(workspaceSpec)`）；启用/禁用状态究竟是 per-workspace 还是全局（profile 级）直接影响验收 8「升级后禁用保持」的语义。建议 tech-design 明确选型及理由。
- **Q5 独立发布的仓库边界未定**（提案 3 纳入 1 vs 需求 3）：交付落 `packages/plugins/expert-squad`（该路径真实存在，先例 git-worktree/input-history/md-mermaid），但需求 3「作为独立插件发布」+ 验收 4 经 plugin-manager 安装要求 npm 公开发布或 git spec——在 dsh-forge 仓内开发与独立发布（独立仓 vs monorepo 子包发 npm，annotutor 先例为独立仓）的关系提案未说明。裁决时需定发布形态，否则验收 4 的「安装源」不可测。

### Note（3 条，留档）

- **N1** 提案 2.1「技能面整体开关（deny `skill` 工具）」表述有歧义：读作「插件对所有专家强制 deny skill」则与档案 frontmatter 的「SKILL 引用」字段矛盾；按上下文实意是「per-expert 白名单里 skill 只能整体开/关，官方无 per-skill 过滤」。建议 tech-design 用一句话消歧。
- **N2** 验收 8「升级该上层包后禁用状态保持」需跨版本升级操作取证，真机成本高；建议 tech-design 设计为 storage 键与包版本解耦的直接断言 + 一次真机升级抽样，避免全量升级矩阵。
- **N3** 2.5 缝 1 的裸 `{{` 拦截自定严格策略与官方放行语义的差异已被提案明示（有官方行为引证），是自觉的「插件更严」而非误读——处置正确，无需改动。

## 三、「更简单/更周到替代方案」核对

- 已被提案显式否决并给出理由的两个候选：官方 agent-presets（YAML 组成行、静态装载、面向部署者——与需求 1 用户目录形态冲突，提案 §1）；dsh-tool-subagent 多实例（persona/toolFilter 静态 Config，源码证实一实例一份固定值，提案 2.4）。两者否决理由均经源码成立，**无被跳过的更简单整体方案**。
- 更周到性：失败路径（坏档案注册期 fail-loud + 热刷新 warn+ignore，验收 5 负向用例）、迁移后果（三层遮蔽 + 禁用状态按 origin 隔离，验收 8）、可移植性判据（验收 6 零业务词汇 + 独立环境装载）均已覆盖。

## 四、四问结论

1. **需求满足**：三条需求各有方案与验收对应（§6 双向核对经复核成立）；官方机制核销全部属实。
2. **方案周密**：直击根因（角色硬编码 → 目录档案 + 运行期注册）；委派复用官方 continuable 正门而非自建派生，承重机械零自造。遗留 Q1-Q4 四个 tech-design 级待钉点，不动摇方案骨架。
3. **改动收敛**：新增机制（目录扫描、注册校验、委派薄层）各有不可替代理由且均声明官方同构；对宿主/官方包零改制，全落官方扩展点；可移植性判据（验收 6）成立。
4. **表述清晰**：术语均有定义句；8 条验收除 Q5 涉及的安装源外均可测；改动面陈述与 dsh-forge 代码库实际相符（`packages/plugins/` 存在）。

## 放行结论

**Blocker 清零（0 条），放行。** 5 条 Question 随报告呈用户，裁决时一并定；Q1-Q4 转 tech-design 强制钉死项，Q5（发布形态）建议在用户裁决时明示。
