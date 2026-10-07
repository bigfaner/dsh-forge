# M3 3.9 spike 残余补验记录（实施期首任务——OQ#4 兑现）

> 排程锚：任务 3.9（`docs/features/dsh-forge-m3-bootstrap-presets/tasks/3.9-spike-residuals-verification.md`）；工件 = 本目录 `overlay-m3.mjs` + `m3-rerun.spec.ts`（env `M3R_FORM` 三形态）。复跑面 = M3 真实装配（3.4 dispatchTask / 3.7 预设装配 / 3.8 host 接线与打包）；packaged 试验床 = 本工作树 `release/installer/win-unpacked/dsh-forge.exe`（`pnpm dist:win` 2026-10-07 23:16 重建——含 3.2 spec skills 物化与 3.7 presets 三底稿随包）。证据根 `Z:\project\dsh\tmp-redesign\m3-3-9\<form>\`。

## 结论总览

| 确认件 | 形态 | 判定 | 证据步（evidence.json） |
|---|---|---|---|
| AC-1 packaged boot 双预设装配 | m3-packaged | ✅ 全绿（2026-10-07 23:32） | seat-on-first-boot / boot-overlay / profile-ui-settings-row / menu-contains-blitz / expedition-catalog |
| AC-1 残余名 packaged-js 负对照 | m3-packaged-js | ✅ 负对照成立（2026-10-07 23:43，5.2m） | packaged-js-catalog / packaged-js-menu / preset-menu-failure |
| AC-2① dev-abs（物化绝对路径 + L1 边界） | m3-dev | ✅ 全绿（2026-10-08 00:00） | boot-overlay-dev / seat-dev / expedition-catalog / blitz-catalog / ws-rebind-skipped |
| AC-2② dev-tf（收窄落位）+ AC-3 relay + AC-4 按需加载 | m3-dev（W 用例） | ✅ 全绿（2026-10-08 fix-1 复跑——默认远征会话直派；drift #9/#10 已修复） | dispatcher-default-preset / dispatch-round / worker-analysis / claim-digest-recon / digest-reconciliation |

（本文件由 3.9 执行回填——各节「实证」均直引 evidence.json 步名与值；W 节由 fix-1 复跑收口回填，2026-10-08。）

## P·packaged boot（AC-1）——全绿

- **hero 座位自现**：零项目 hero 无 composer（3.9 首轮探针实证——注册后芯片流进会话面）；RPC 注册夹具 ws + 芯片绑定后，`conversation.hero.agentPreset` 座位在场且零 developerTools UI 动作——ui-settings 首启预置生效（`{userData}/profile/cordis.patch.yml` 含 `- id: ui-settings` + `enabled: true`，evidence `profile-ui-settings-row`）。
- **registry default = 远征**：座位折叠 label = 远征模式（evidence `seat-on-first-boot`）。
- **双预设装配在场**：`{userData}/boot-overlay.yml` 含 `preset-expedition` + `preset-blitz` 行块 + `agent-preset-registry` `default: expedition`；菜单远征/突击双项可选（evidence `boot-overlay` / `menu-contains-blitz`）。
- **presets 物化 resources 绝对路径**：customSkillDirs 全集 = `…\win-unpacked\resources\runtime\node_modules\@dsh-forge\plugin-forge\skills`（core ×3：全局 skill-filesystem 行 + 远征 + 突击）+ `…\plugin-forge-spec\skills`（spec ×1：远征）；**零 `!!js` 残留**、平台门行就地求值为具体布尔（evidence `boot-overlay` 的 `platformGateRows`）。
- **解析实证（真实模型轮）**：远征默认会话目录转录 = 12 技能（core 4：git-commit/run-tasks/run-tests/submit-task + spec 7：eval/gen-contracts/gen-journeys/gen-test-scripts/tech-design/ui-design/write-prd + diagnose-windows-sandbox-acl 上游技能）——resources 绝对路径在打包形态真实可达（evidence `expedition-catalog`，GLM-5.3-Flash 真实往返 12.3K tok）。

## N·packaged-js 负对照（AC-1 残余名）——负对照成立

- 实验变量恰一行：外部叠层（boot overlay 之后应用，row id 覆盖）整行重述产品远征预设，`customSkillDirs[core]` 换 §5.6 官方 `!!js` 表达式（spec 目录保持 resources 绝对路径——其余行块逐字同产品底稿）。
- **观察（evidence `packaged-js-catalog` / `packaged-js-menu` / `preset-menu-failure`）**：座位 label 回退 **id**（`expedition`——非 display name「远征模式」，S5「broken 回退 id」同象）；预设菜单不含「远征模式」条目（仅标准/突击/PTC/极简/创造 + 一条空描述的裸 `expedition` 行 = broken 行呈现形态）；目录转录零技能条目（默认预设 broken → 会话未起）。**write-prd 不可见 = 主判据绿**；loud 守卫（!!js 形态下 spec 技能仍可见 → 重判）未触发。
- 判定：`!!js` 在打包形态（`DSH_FORGE_PATCH_FILES` 外部叠层语境）不可解析 → **行 broken、整预设不上菜单**——与 dev 形态 ERR_PACKAGE_PATH_NOT_EXPORTED 判决（S5-4 反转）合流，**!!js 全形态死刑确认**；产品零表达式物化（3.7）为唯一可行装配形态的裁决获正反两面实证。

## D·dev-abs 绝对路径装配 + L1 物理边界（AC-2①）——全绿

- **dev 物化绝对路径（dev-abs 判定物）**：`{userData}/boot-overlay.yml` customSkillDirs = `Z:\…\redesign\node_modules\.pnpm\node_modules\@dsh-forge\plugin-forge(-spec)\skills`（installAnchor 树上溯首中 pnpm hoisted 面——字面绝对路径、零 `!!js`；evidence `boot-overlay-dev`）。一版 spike 的 dev-abs 残余问题（绝对路径解析）在 M3 真实代码面 = 产品 renderBootOverlay 既定行为，实证成立。
- **默认远征 + 座位**：label = 远征模式（evidence `seat-dev`）；新会话继承工作区绑定（无选择卡片——`ws-rebind-skipped`，3.9 新观察，与 m2 芯片流首绑形态互补）。
- **远征目录 = spec 全量**：12 技能（core 4 + spec 7 + 上游 1——与 packaged P 完全同集，evidence `expedition-catalog`）。
- **L1 物理边界（真实预设）**：突击会话目录 = 恰 core 4（git-commit/run-tasks/run-tests/submit-task）——**物理不含任何 spec 技能**（write-prd/tech-design 缺席断言绿；evidence `blitz-catalog`）。S6-3 同构边界在 3.7 真实预设复现。

## W·派发探针（AC-2②/AC-3/AC-4）——全绿（fix-1 复跑收口，2026-10-08）

首轮实跑（2026-10-07 23:48 / 2026-10-08 00:27 起）+ 三枚诊断探针（.forge/tmp/probe-{bindings,resolver,4/5/6}）发现双产品缺陷 → fix-1 修复（drift #9/#10，处置与修复记档 tech-design Appendix 各条处置段）。修复后三轮复跑（2026-10-08 01:12 / 01:27 / 01:35，末轮全绿 = 验收轮）：

**修复面（fix-1）**：①`WORKER_GLOBAL_DENY_TOOLS` 重映射实面实名八员（ask_user_question / delegation 族五员 subagent_fork·list_agents·send_message·interrupt_agent·workflow / todo_write / present——spawn provider 惰性注册的 `subagent` 刻意不入）；②expedition/blitz 底稿行内 plugin-forge[+spec] 增量行携带 `bindingsFile` 同 config（`{{plugin-forge-bindings}}` 占位符，renderBootOverlay 物化与全局行同值）——预设会话行内实例自足 cwd 路由。

**末轮全绿形态（默认远征会话直派——标准模式绕行径已拆除，evidence `dispatcher-default-preset` label=远征模式）**：

- **deny 零泄漏**（AC-2② dev-tf 落位）：双 worker dump deny 交集空集——探针修正为 scoped 面（`ToolRuntime.schemas(exec.agent)` 受限视图；裸 ctx.tools.schemas() 无 scope 量的是全局注册表 = 3.9 一版探针测量缝）；worker 面余 = fs/shell/jobs/skill/knowledge/probe/addTask+submitTask/web/goal 族（矩阵放行面）。task-spawned 事件 toolFilter = 12 员实名表机械双证。
- **dispatchPrompt digest 对账**（AC-3 relay 前置）：双 worker 首条用户消息 digest === claim 行 digest（`c71da57f017b` / `3801157e973a`，equal=true）；人格段 + type-policy 段在场。事件解码修正：user/message 载荷在 data 直位（非 data.message）、系统提示词事件类型 = 'system/message'。
- **AGENTS.md 到达 + 技能目录常驻**：承载通道实测 = user/message 上下文注入事件（`source.kind='agent-instructions'` / `'skill-catalog'`——非 system 提示词段）；双 worker 上下文注入面含基线标记与 run-tests 目录行（doc worker 自答「有」行为面互证）。
- **run-tests 按需加载正反例**（AC-4）：test 任务 worker `skill(run-tests)` 调用在场、doc 任务 worker 零调用（目录行常驻、内容按需）。
- 附带实证：worker 结算两态均见（completed 与 blocked——blocked = 夹具 justfile 无 run-tests 面的如实受阻，非断言门）；`task-worker-done` 事件终态等待缝补齐（dump = 起跑信号非终态信号——closeApp 前不等终态会杀活 worker）。

**历史缺陷记档（首轮发现，fix-1 承接）**：

- **缺陷一（drift #9）——预设会话 forge 工具整体断链**：远征默认会话 dispatchTask/queryTask 全部 `ERR_WORKSPACE_NOT_REGISTERED`（bindings 文件在盘且行正确——探针②直读核对；标准模式对照组同径全绿——探针⑥）。定位 = 3.7 双行形态：预设行内 plugin-forge 增量行（config-less）在预设会话胜出工具注册面，全局行 bindingsFile 配置不可达。绕行径 = 标准模式会话派发（首轮采納，fix-1 后拆除）。
- **缺陷二（drift #10）——worker 全局 deny 名表与上游实面对不上，spawn 恒拆**：标准模式会话派发 → `ERR_SPAWN_FAILED — tools.restrict() names unknown global tools "ask-user", "delegation", "todo"`（driver 对未知名 loud 校验；实面真名 = `ask_user_question`/`todo_write`/delegation 族 = `subagent_fork`+`list_agents` 等——错误消息附 33 员全量已知名表）。三次重入三连败 → **halted 粘住熔断**（防线机制本身按设计工作）。`WORKER_GLOBAL_DENY_TOOLS`（contracts pin）四名中三名不存在 → **任何 taskType 的 worker spawn 均不可用**——OQ#2「实施期按当期上游工具面枚举核对入 pin」的全局集前置欠账，无 3.9 内合规修复径（名表 = PRD In Scope ① + contracts pin，硬规则禁就地改）。

**W 四确认件的处置**：AC-2②（dev-tf 收窄）/AC-3（relay 文本）/AC-4（按需加载正反例）的正向断言均需成功 spawn 的 worker 会话——fix-1 修复后复跑全绿（断言通道 = worker dump deny 泄漏检查 / 会话文件解码首条=dispatchPrompt digest 对账 + AGENTS.md 上下文注入到达 + 目录常驻 + tool/call 轨迹 run-tests 调用正反例——`m3-rerun.spec.ts` W 用例 = 5.2 SC2 消费面）。附带正向结论：**dispatchPrompt digest 双记闭环（claim 行 ↔ task-claimed 事件同值）与幂等重入（in_progress 留置 + 简报重合成 digest 稳定）已实证**。

## 环境注记（3.9 执行期）

- 2026-10-07 凌晨的「新建 Electron 空文档」环境故障已不复现（packaged/dev 手动 spawn + CDP 附着全绿）。
- 陈旧 release 伪装回归防线生效：本任务首步重跑 `pnpm dist:win`（09:28 旧包早于 3.2/3.7/3.8 全部提交——staging 无 plugin-forge-spec/presets）。
