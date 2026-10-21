# 提案评审报告：input-history 独立插件（双插件拆分·第一份）

- 评审对象：`proposals/composer-input-history-plugin/proposal.md`（2026-10-20，status: Draft，mode: blitz）
- 仓库根：`Z:\project\dsh\dsh-forge\.forge\worktrees\composer-input-history-plugin`（分支 composer-input-history-plugin，基于 main）
- 评审立场：独立 subagent，结论全部来自本次实读的提案、本仓代码（main / composer-correction 分支）、官方包源码（`D:\software\dsh-forge\data\profile\node_modules\@deepseek-ai\*`）与 annotutor 文档。

## 结论摘要

官方机制面四项核心假设**全部核销成立**：plugin-manager 动态装/卸通道（含 `link:` spec）、`__ModuleLoader__` 装载器与 client bundle 装载契约、`dsh.client` 清单（platform/inject/external）、`binding.eventSource` 会话事件面，均为官方真实存在且与提案用法一致；「首次建立双面包装载范式」的「首次」也属实（main 上无任何包声明 `dsh.client`/`dsh.bundle`）。方案方向正确、复用官方机制到位、验收可测性总体良好。

但存在 **1 个 Blocker**：提案的「现状」陈述与 main 基线不符——输入历史的硬接线 wiring 与 features 开关**只存在于未合入分支 composer-correction，main 上零痕迹**，导致「开关退役/硬接线退役/痕迹清理」整个工作项在既定基线（main 拉新分支）上空转，验收 4「inputHistory 开关痕迹零残留」不可测。需修订提案的现状描述与退役范围后重评。

问题计数：**Blocker 1 / Question 1 / Note 4**。Blocker 未清零，暂不放行提请用户裁决。

---

## 四问逐项核验

### 问 1：需求满足吗？

| 提案假设/需求 | 核验结果 | 证据 |
|---|---|---|
| 官方 dsh plugin-manager 动态装/卸通道（CLI `add`/`remove`、`--profile`） | ✅ 成立 | `@deepseek-ai/dsh-plugin-manager/lib/index.js:293`（`"add"` 命令族）；`lib/index.js:75`（`parseInstallSpec` 显式剥 `file:`/`link:` 前缀 → `link:<path>` spec 官方支持）；README「install or remove external bundles」「The CLI exposes `dsh plugin --profile <profile> …`」 |
| 官方 `__ModuleLoader__` 装载器 + 自注册 CJS bundle 契约 | ✅ 成立 | `@deepseek-ai/dsh-client-modules/lib/client.js:1`（`window.__ModuleLoader__.load({id, factory})`）；`lib/client.js:625/739`（「loaded without registering … via __ModuleLoader__.load」告警即提案验收 1 的 `did not activate` 同族）；README「Build requirements」+ Lazy-CJS 模型章节；annotutor `gotcha-web-boot-loaded-without-registering.md:13-25`（配方与四断言守卫判例） |
| `dsh.client` 清单（`platform: web` + `inject` + 种子表外置） | ✅ 成立 | `@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts:76-89`（`DshClientManifest { platform, inject?, immediately?, external? }`）；`dsh-client-modules/README.md:34/46`（`dsh.client` 声明 + `PLATFORM_MODULES` 冻结种子表） |
| `binding.eventSource` 会话事件面 | ✅ 成立 | `@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.d.ts:76-83`（`SessionBinding { sessionId, session, eventSource: SessionEventSource, ctx }`；`SessionEventSource = ObservableSnapshot<SessionEventWindow>`，`contract/events.d.ts:63`） |
| dsh 清单 + `cordis.patch.yml` 单行插 | ✅ 成立 | `@deepseek-ai/dsh-app-boot/lib/index.js:487`（`PROFILE_PATCH_FILENAME = "cordis.patch.yml"`）、`:471`（`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`） |
| 参考分支 composer-correction 存在且含判例 | ✅ 成立 | `git branch` 列出 `composer-correction`；`git ls-tree composer-correction -- packages/plugins/composer-correction`（`src/client/input-history.ts` 及测试在场）；`composer-correction:apps/web/src/client-plugin/plugin.test.ts:189`（binding.eventSource 注入判例）、`plugin.ts:1479-1586`（键位接线 + mention 菜单态守卫）、`plugin.ts:79`（`createInputHistory` 消费面） |
| 「首次建立双面包装载范式」之「首次」 | ✅ 成立 | main 上 `packages/plugins/{git-worktree,md-mermaid}` 均无 `dsh.client`/`dsh.bundle` 声明（`git grep '"bundle"\|dsh.client' main -- packages/plugins/*/package.json` 仅命中无关行）；两包均为壳内硬接线消费 |
| annotutor 外部参考文档可访问 | ✅ 可访问 | `Z:\project\dsh\annotutor\docs\lessons\gotcha-{dsh-plugin-host-activation-chain,web-boot-loaded-without-registering}.md`、`docs/reference/dsh-real-host-verification.md` 三份均在，内容与提案引用一致（含 cordis `invalid plugin`（缺 apply）遗留记述于 gotcha-web-boot:43——提案「含组合 apply」正是对该判例的对策） |
| **「现状 = apps/web 壳内硬接线 wiring + features 开关」** | ❌ **不成立（Blocker B1）** | main 上 `git grep -i "inputHistory|input-history|composerFeatures" main -- apps packages` **零命中**；features 配置模型/env 覆写缝/global 门控全部只来自 composer-correction 的未合入提交（`5fc3512c`/`237e190e`/`71f331ba`） |

需求覆盖本身（装/卸即开关、纯 client 包、范式首建、e2e 装卸取证）每条 In Scope 均有对应方案与验收条目，无漏项；唯一裂缝是 B1——「退役」类工作项建立在不存在的现状之上。

### 问 2：方案周密吗？

- **根因对位**：需求根因是「功能被锁死在 dsh-forge 壳内、装不进官方 desktop」——方案以独立插件 + 官方 plugin-manager 通道直击该根因，非贴补丁。✅
- **失败路径意识**：装载契约直接吸收 annotutor 两份 gotcha 判例（自注册 CJS、react 永不内联、修一环必须真机重验），验收 5 用四断言守卫钉死产物形状；验收 1 用 boot 告警零容忍 + 卸载后原生行为回归兜住装卸两端。✅ 周密。
- **边界缺口**：桌面侧**会话事件缝的获取径**未落承诺——参考分支中 `sessions`/binding 是宿主 wiring 注入（`composer-correction:apps/web/src/client-plugin/plugin.test.ts:189`、`plugin.ts` `bindingCtxOf` 经注入的 `sessions.binding(id)`）；插件化后必须依赖官方 desktop 组合把 `ClientSessions` 服务注入插件 ctx（官方类型在场：`ClientSessions implements ISessions`，`service.d.ts:86`）。提案只写「解包适配内联本包」，未把「桌面侧 binding 获取缝」列为核销项（对比：装载器复用明确写了「tech-design 首项核销」）。→ Q1。
- **更简单方案检查**：未见被跳过的更简单整体方案。备选（维持硬接线 + 只在官方 desktop 侧另做）会复制两份实现，违背双插件拆分裁决；当前方案（插件包 + 官方通道 + 壳改官方装载径）即最小正道。✅

### 问 3：改动收敛吗？

- 新增面 = 一个插件包 + 壳装载径切换 + 按包 e2e，与需求对等；无 npm 公发、无设置面、无 annotutor 遗留搭车（排除清单明确）。✅
- 范式基建（bundle 配方脚本/守卫/dsh 清单）有已立案的第二消费者（edit-resend 第二份提案），非想象未来。✅
- 对宿主改动限 boot 装载径与痕迹清理，走官方扩展点（`__DSH_BOOT__` 组合图是既有官方缝：main `apps/web/src/shell/boot.ts:62-102` 已在用 `steerBootGraph` 追加产品插件行）。✅
- **不收敛点即 B1**：`apps/web/src/client-plugin/` 痕迹清理（proposal.md:47）在 main 上无对象——改动面陈述与代码库不符。

### 问 4：表述清晰吗？

- 术语（自注册 CJS、种子表、组合 apply、解包适配）均有官方源码或 annotutor 判例锚定，可唯一理解。✅
- 验收 1/2/3/5 可测（真机 CLI + boot 告警 + 守卫测试，现有 vitest/Playwright 设施可承载；e2e 命名 `e2e/specs/blitz/input-history*.spec.ts` 与既有 `blitz/md-mermaid-plugin.spec.ts` 先例一致）。✅
- 验收 4 后半「inputHistory 开关痕迹零残留」在 main 基线上无对象、不可测（B1）。❌
- 一致性检查段逐条对账无矛盾。✅

---

## 问题分级清单

### Blocker

**B1 · 现状陈述与 main 基线不符，「退役」工作项与验收 4 空转/不可测**
- 证据：proposal.md:13（「输入历史功能现以 dsh-forge 仓内硬接线交付（apps/web 壳内 wiring + features 开关）」）、:29（「开关退役（本包范围）：features 常量/env 覆写缝/页内 global/config 门控中 inputHistory 相关全量移除」）、:46-47、:81（验收 4）。实况：`git grep` main 全仓零 inputHistory/features 开关痕迹；该 wiring 全部在未合入分支 composer-correction（提交 `5fc3512c`/`237e190e`/`71f331ba`），而提案自定基线 = main 拉新分支（:17）。
- 后果：按此拆任务会产出「清理不存在代码」的空转任务；验收 4「零残留」在 main 上平凡真、失去把关力；且暗示作者对交付起点（净新增功能 + 参考分支移植）的误判。
- 修订要求（二选一，brainstorm 处理）：① 改现状陈述为「main 上无此功能；本提案净新增，逻辑自 composer-correction 参考移植」，删除「开关退役/硬接线退役/痕迹清理」工作项，验收 4 改为「dsh-forge 壳缺省装载本包即功能可用 + 不引入任何 inputHistory 开关面」；② 若确需退役 composer-correction 上的开关面，须先澄清该分支与本分支的合并关系（与「基线 = main」自洽化）。

### Question

**Q1 · 桌面侧 `sessions`/binding 事件缝的获取径未列为核销项**
- 证据：proposal.md:30/40 只承诺「binding.eventSource 解包适配内联本包（参考分支判例）」；参考分支的 `sessions.binding(id)` 消费（`composer-correction:apps/web/src/client-plugin/plugin.ts` `bindingCtxOf`）建立在宿主 wiring 注入之上（`plugin.test.ts:189`），非插件自取。官方服务类型在场（`ClientSessions implements ISessions`，`dsh-api-session-controller/.../service.d.ts:86`），但 desktop web 组合是否将该服务注入到动态安装插件的 ctx、以何服务键，提案未核销。
- 建议：与「官方装载器复用」并列列为 tech-design 首批核销项（与 proposal.md:29 的先例同格式），派发前给出官方注入缝证据。

### Note

- **N1（正向核销）**「首次建立双面包装载范式」属实：main 无包声明 `dsh.client`/`dsh.bundle`，md-mermaid/git-worktree 皆为壳硬接线插件包——范式首建定位准确，基建复用有真实第二消费者。
- **N2** `官方 tsdown.client.ts` 配方基准系间接核销：annotutor gotcha（`gotcha-web-boot-loaded-without-registering.md:13,30`）指认官方仓 `packages/client/tsdown.client.ts`，profile 内发布包仅含 `lib/`（无该源文件），本次未能直接读取官方仓原文件；tech-design 落配方时应取官方仓文件逐位对照一次。
- **N3** 「装/卸即功能开关」语义在两侧不同：desktop 侧 = plugin-manager 装卸（验收 1 覆盖）；dsh-forge 壳侧 = 缺省装载、不提供卸载动线（验收 4 只验缺省可用）。提案表述已自洽，仅需在 e2e 取证范围里明确 forge 侧不做卸载断言，避免验收期口径争议。
- **N4** `docs/lessons/` 只立目录概要、条目随实现增补（proposal.md:69-74），符合工作区「不预写内容」纪律；无异议。

---

## 放行结论（初评）

**Blocker 未清零（1 项）。** 官方机制假设全部成立、方案骨架成立，但 B1 的现状/基线错位必须先经 brainstorm 修订（现状陈述 + 退役范围 + 验收 4），重评清零后方可提请用户 accept/reject 裁决；Q1 建议随修订一并补入 tech-design 核销项清单。

---

## 复评（2026-10-20，修订版 proposal.md）

### 修订对照核销

| 项 | 修订要点 | 核销结果 |
|---|---|---|
| B1 | 现状陈述改为「仅存在于未合入分支 composer-correction，main 零痕迹」；删「开关退役/痕迹清理」工作项与 client-plugin 清理行；验收 4 改为「壳内无开关门控、无硬接线 wiring 引入」 | ✅ proposal.md:13（现状陈述与 main 实况一致，注明核实出处）；:29（「壳装载径」条目改为不引入硬接线/开关，retirement 工作项已删）；:46-48（改动影响范围不再含清理行）；:81（验收 4 现为可测断言：缺省装载可用 + 壳内无门控/wiring 引入，git grep 可核） |
| Q1 | tech-design 首项核销扩为两条：① 装载器复用；② desktop 组合 sessions/binding 事件缝注入核销 | ✅ proposal.md:30（明确「参考分支系宿主 wiring 注入，插件化后须独立核销」——与初评建议同格式） |
| N3 | 交互面表「插件装卸」行明确两侧语义差异；一致性检查同步 | ✅ proposal.md:38（desktop 动态装/卸 vs 壳缺省固定装载，e2e 口径分别取证）；:86（一致性检查分列两侧口径） |

### 新引入问题检查

通读修订版全 87 行：现状陈述、方案条目、影响范围、验收、一致性检查五处联动修订自洽。mermaid 图 INST 节点仍笼统写「dsh desktop / dsh-forge plugin-manager 动态装/卸」，与 :38 的两侧语义分列存在轻微表述张力，但交互面表已作权威界定，不构成歧义（归入原 N3 留档，不升级）。未发现其他新问题。

### 复评结论

- **B1 清零**；Q1 已并入方案（转为 tech-design 执行项）；N1/N2/N4 留档，N3 已在提案内消化（残余图示张力不阻塞）。
- **Blocker 计数：0**。放行判据达成——报告连同未决 Note（N2：tech-design 期对官方仓 `tsdown.client.ts` 做一次逐位对照）一并提请用户 accept/reject 裁决。
