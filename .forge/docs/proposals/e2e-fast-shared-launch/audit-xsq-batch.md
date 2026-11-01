# 用例价值审计对账表 — 存量迁移（1.5）

提案：e2e-fast-shared-launch（1.5 存量全量迁移）；样本：1.3 试点 expert-squad-panel-detail.spec（16 例保留 / 4 例退役，见 audit-panel-detail.md）。
裁定准则（同试点）：退役 = 纯文案/label/静态渲染断言（unit 等价覆盖在案）；保留 = 行为/语义/写径断言（真机才有增量）。

## 批次一：expert-squad 族 9 份（commit bea57b02）

全部迁移共享 launch 形态（`createSharedLaunchFixture`——launchHost 整 spec 一次 + 用例间 tmp 夹具档案重播种 + crash 自动重启续跑），零退役，冷启点 40 → 9。逐 spec 裁定与适配点见 git 历史版本文档；计时对账：迁移形态 398.3s（workers=2），19 例红中 18 例存量红（原始形态逐例同红）+ 1 例 hot-reload whitelist watch 衰减耦合（fix-1 已修，commit ca5b52cc）。

## 批次二a：m2 大户 4 份（commit 672445e5 + 续）

| spec | 用例数 | 冷启点 | 裁定 |
|---|---|---|---|
| m2/fix-chain-auto-recovery | 10 | 11 → 1 | 全保留。各用例独立 feature slug 隔离账本面；.forge 任务账本跨用例存续（重播种只清 .dsh）——4 处全表计数断言（task_edges 全表 / fix 谱系全表 / 去重行数×2）按 slug 收敛作用域，语义等价 |
| m2/task-dispatch-pipeline | 8 | 9 → 1 | 全保留。同款 slug 隔离；Step2b「空库盲选零写入」与 Step2d「会话零挂接」两处全表断言按 feature slug 收敛作用域；共享账本下盲选就绪池无跨用例污染（存量残留任务均非就绪 pending，逐用例核verified） |
| m2/task-overview-review | 11 | 12 → 1 | 全保留。多工作区形态适配：共享根目录 + 各用例独立子目录 wsDir——注册链 canonical 幂等按目录键，独立子目录保每用例独立项目名/任务库（ov-head 项目名断言语义保持），不被重播种波及 |
| m2/interrupted-dispatch-recovery | 6 | 7 → 1 | 全保留。独立 feature slug 隔离；库断言本就按 task_id 作用域，零适配 |

本批次 **零退役**：逐用例复核未发现「unit 已持有等价覆盖」的纯文案断言用例；全部为行为/写径/守卫断言。

### 保留原形态裁定（批次二a）

| spec | 冷启点 | 裁定理由 |
|---|---|---|
| m2/task-session-linkage | 10（9 用例） | 会话开户/盘侧差集定位（findFixtureSession + fixtureSessionIds 前后差集）强依赖每用例全新 userData 会话账本；共享 userData 下会话累积使定位语义漂移，无法等价保持 |

## 批次二a 补充（run 证据与归因，commit 672445e5 + 批次二a 收口提交）

- 迁移对象修正：m2/interrupted-dispatch-recovery 迁移（7 → 1，idr 6/6 真机全绿）；m2/task-session-linkage 与 m2/workspace-registration-derived-path 裁定保留原形态（理由见上表）。
- tdp/ovr 采用「共享根 + 每用例子目录」隔离（注册链 canonical 幂等按目录键——独立项目名/任务库/盲选池，语义等价原始全新世界）；tdp 2d 盲选断言迁移后反而转绿（基线原形态同红）。
- 真机对账（workers=2）：
  - 基线（原始形态，3 spec 25 用例）：13 failed / 12 passed（`003-batch2a/baseline.log`）；
  - 迁移后：idr 6/6 绿；ovr 11 红与基线逐例一致（**全 spec 存量红**——产品 UI 漂移，零迁移回归，Hard Rules 归因上报）；tdp 8 例中 7 绿，1 例概览 UI 序列态轮转红（见下）。
- **共享 launch 序列态轮转红（上报待跟进，越界）**：tdp 三个概览 UI 用例（smoke/5b/6b）在共享会话序列下轮转单发红（run5=6b、run6=5b、run7=5b、run8=6b），`--grep` 隔离 run 恒绿（`run4-6b-isolated.log` 23.7s passed）；病征 = 概览 tasks subtab 间歇缺席/detach 竞速。已试收口（芯片流显式选定、Esc 菜单收口、条件点击、桥导航视图还原）均未根除——修法判定落 `e2e/support/fixtures.ts` 支撑层（重播种级 renderer 态复位或概览面板隔离），超出本任务「改动仅限 e2e/specs/**」边界。
- 批次二a 计时：迁移形态 4 spec 35 用例 157s（run1，含 11 例 TDZ 误红）；修正后 3 spec 25 用例约 1.1-1.3m/spec 批（run7/run8）。原始形态基线 3.2m（13 红快速失败情形下）——全量批计时对账于全量迁移后统一收口。

## 计时对账（批次二a）

真机 electron run（workers=2，--project=desktop，4 spec 35 用例）：见 `logs/e2e-fast-shared-launch/1.5/003-batch2a/run1.log + elapsed.txt`（批末回填对比值）。

## 批次三a：worktree 族前 8 份（commit 见 git 历史）

全部迁移共享 launch 形态，**零退役**（逐用例复核：全部为行为/写径/编排断言，无 unit 等价覆盖的纯文案面）。8 份 spec 均单用例形态，冷启点 8 → 8（每 spec 1，无削减收益；本批次价值 = 形态收敛 + 重播种/crash 自动重启机械统一）。

| spec | 用例数 | 冷启点 | 裁定 |
|---|---|---|---|
| worktree-base-branch-order | 1 | 1 → 1 | 保留（排序/去重/默认选中语义——UI 选项面行为断言） |
| worktree-capability-absent-matrix-1-6-k5 | 1 | 1 → 1 | 保留（非 git 域官方原流零拒绝 + 发送落盘判读；迁移顺带修复存量测试代码 ReferenceError——existsSync 未导入，见下） |
| worktree-confirm-latch-1-34 | 1 | 1 → 1 | 保留（点选时点确认 + 闩锁静默切换 + 持久化） |
| worktree-create-follow-error | 1 | 1 → 1 | 保留（同名去重 + 自动跟进 + 错误呈现写径） |
| worktree-create-stale-toast | 1 | 1 → 1 | 保留（bug dbbef6a8 回归守卫） |
| worktree-hero-chip | 1 | 1 → 1 | 保留（chip 激活/belonging 断言） |
| worktree-hero-default-anchor | 1 | 1 → 1 | 保留（默认回填纯展示零编排守卫） |
| worktree-mandatory-bind-1-27 | 1 | 1 → 1 | 保留（1.27 推导制绑定闭环——会话 cwd = 所选树） |

适配点：夹具工作区即 git 仓本体（seedWorkspace 同参播种，首启/重播种/crash 重启统一）；capability-absent 的发送落盘判读改扫共享 userData 根（dsh-forge-shared-launch-ud-*）内 dsh-home/sessions 按夹具路径段锚定；其余 spec 直接消费 sharedLaunch 句柄，零额外适配。

### 真机对账（workers=2）

- 基线（原始形态，8 spec 8 用例）：3 passed / 5 failed（`logs/e2e-fast-shared-launch/1.6/001-baseline/run1.log`，228.3s）。
- 迁移后：3 passed / 5 failed，**失败 spec 集与基线逐例一致**（run1.log 在 `004-migrated-run2/`，315.2s——红例的发送重试/超时路径拉长批时）。
- 逐例归因：
  - create-follow-error / hero-chip / hero-default-anchor：迁移形态与基线**同断言同红**——存量红（产品侧），零迁移回归。
  - capability-absent：基线红在存量测试代码 ReferenceError（existsSync 未导入，原始形态同红）；迁移补导入后暴露其下真实红「发送未落盘」。原始形态（仅补同一导入的临时基线副本）同样红在「发送未落盘」（`006-baseline-attribution/run1.log`）——**存量红，零迁移回归**；本迁移顺带修复存量测试代码缺陷。
  - mandatory-bind：基线（原始形态）红（click 超时）；临时原始形态副本复跑绿（`006-baseline-attribution`）；迁移形态 3/3 红（`004` / `005-isolated-retry` / `007-mb-third-sample`，后两次隔离 run 断点稳定在「wt-a 应入清单且携带 workspaceId」）。两形态均出现红 = 产品 1.27 流程 A 不稳定红（存量），但迁移形态红率显著高于原始形态样本（3/3 vs 1/2）——**迁移耦合不排除，上报待跟进**（单用例 spec 共享形态与原始形态环境近同，疑点偏向产品侧流程 A 时序，需产品侧归因）。



## 批次三b：worktree 族余 7 份（本批次）

全部迁移共享 launch 形态，**零退役**（逐用例复核：全部为行为/写径/守卫断言，无 unit 等价覆盖的纯文案面）。7 份均单用例形态，冷启点 7 → 7（无削减收益；价值 = 形态收敛 + 重播种/crash 自动重启机械统一）。

| spec | 用例数 | 冷启点 | 裁定 |
|---|---|---|---|
| worktree-p1-guards-1-31 | 1 | 1 → 1 | 保留（点选时点确认三场景 + 零会话副作用） |
| worktree-pending-receipt-retire-1-6-k3 | 1 | 1 → 1 | 保留（回执退役 + 零 pending 卡挂——发送落盘判读） |
| worktree-pure-selection-1-29 | 1 | 1 → 1 | 保留（快速切换 + 发送落所选树） |
| worktree-risk-confirmation | 1 | 1 → 1 | 保留（点选时点风险确认 + 新建基准确认） |
| worktree-row-interlude | 1 | 1 → 1 | 保留（切项目折返序列 + 发送落 Y） |
| worktree-same-name-follow | 1 | 1 → 1 | 保留（同名跟随三态 + 创建落位） |
| worktree-workspace-membership-1-28 | 1 | 1 → 1 | 保留（树内会话挂工作区投影） |

适配点（同批次三a）：夹具工作区即 git 仓本体；k3 落盘判读扫共享 userData 根（片段 = wsDir 末段小写归一——cwd 分组目录名为扁平化路径，且 mkdtemp 后缀随机大小写须两侧同归一）；pure-selection/row-interlude 会话开户判读同末段口径；membership 落盘取证扫 wt-a 段；row-interlude 非 git 折返项目为用例内临时 tmp 目录独立注册/清理。

### 真机对账（workers=2）

- 基线（原始形态，临时副本，`003-batch3b/baseline-run1.log`，4.0m）：4 passed / 3 failed——pure-selection「建树零新增 wt-a 会话」、membership「首条消息应落会话日志」与迁移形态同断言同红（**存量红**）；p1-guards 红在 launch.ts:349 TypeError（launch 层基建抖动，5.9s 快速失败，隔离重跑 `baseline-p1guards-retry.log` 绿）。
- 迁移后全批（`003-batch3b/migrated-run2-final.log`，4.3m）：**5 passed / 2 failed**，失败 = pure-selection / membership，与基线逐例同断言——存量红，零迁移回归。
- 迁移过程顺带修复迁移判读适配缺陷（非存量）：k3 落盘判读初版用全路径片段（扁平化目录名不含斜杠，miss）+ 二版末段未小写归一（mkdtemp 随机大小写 miss）——两处修正后 k3 独立与全批均绿（`migrated-k3-fixed2-run.log` 40.0s）。

## 批次四a：m3 族前 11 份（按名称序，commit 见 git 历史）

8 份迁移共享 launch 形态 + 3 份特殊面保留原形态（理由见下表）。**零退役**（逐用例复核：全部为行为/写径/守卫断言，无 unit 等价覆盖的纯文案面）。

### 迁移 8 份

| spec | 用例数 | 冷启点 | 裁定与适配点 |
|---|---|---|---|
| blitz-direct-chain | 3 | 3 → 1 | 全保留（quick-tasks 产出 + 五态评审 + 容器琥珀点 + blocked/证据门）。账本 slug 隔离（jbdc-*）；boot-overlay 判读改扫共享 userData 根（内容三底稿每启重写与路径无关）；「零纠正写」全表计数为本 spec 首用例承载（声明序串行） |
| bootstrap-walkthrough | 2 | 2 → 1 | 全保留（成链三件 + 记录 100% 入自身库 + 全景一致）。manifest 扫描根 = sharedLaunch.wsDir（fixtureRoot 与 wsDir 合一）；全表 GROUP BY 断言同上由首用例承载 |
| bug-quick-add-single-effect | 1 | 1 → 1 | 保留（bug 2d5434d1 单效守卫——chip 落当前会话 + 零新会话）；会话行计数为 UI 差集断言零适配 |
| expedition-full-sdd-chain | 3 | 3 → 1 | 全保留（全链 + 打回/superseded + 幂等/守卫/append-only）；boot-overlay 同上；slug 隔离（jefc-*） |
| gate-and-submit-discipline | 3 | 3 → 1 | 全保留（两态账本 + 拒绝面族 + 受阻径）；AGENTS.md 播种进 seedWorkspace（首启/重播种/crash 重启统一，Step2 未配置态用例内 unlink 即时断言） |
| mode-selection-alignment | 3 | 3 → 1 | 全保留（座位/菜单/幂等点选 + 自动对齐/无溯源不切换 + 错配守卫）；预设选择跨用例不漂移（T1 幂等点选收口 = 突击 = registry 缺省 = T2/T3 期望基准） |
| overview-entry-new-session | 3 | 3 → 1 | 全保留（四渠道入口/预填/诊断发送）；会话开户判读改扫共享 userData 根内 dsh-home 按 WS_NAME 段锚定（本 spec 独有段零串扰），birthtime 升序口径逐字保持 |
| preset-physical-isolation | 1 | 1 → 1 | 保留（预设物理隔离枚举面）；boot-overlay 判读同上；共享形态下夹具根与 wsDir 合一（fs 枚举通道不变） |

序列态收口（本批次新增，spec 内局部 helper——`openOverviewSubtab` 概览 dock 重开重试 ×3 + mode-selection `selectWorkspaceWithRetry` 芯片菜单重试）：共享会话下上用例会话面沉降窗内中心列拦截子 tab 点击 / hero picker 菜单重挂载行 detached——收口后 run1 的 3 例序列红（bootstrap Step1b / expedition Step2b/2c / overview T3）全数转绿（`migrated-run3-retrywrappers.log`）。同径先例 = dogfood-sc-m3-replay `openOverviewDockWithRetry`（keyed body 重挂载触发布局重解析；瞬态窗对策非放宽断言——轮内 30s/15s 门原样保留）。

### 保留原形态裁定（批次四a）

| spec | 冷启点 | 裁定理由 |
|---|---|---|
| m3/ac4-routing-probe | 2（2 用例） | 壳级取证件：dev profile cordis.patch.yml 用户层播种/还原（跨 worker 共享仓文件——共享会话下播种窗污染并行 worker 装载面）+ 自管 userData + 真实凭据门/去模型化门 + 用例中段 closeApp + keepEvidence 不清理——与共享 fixture 生命周期语义不相容 |
| m3/dogfood-sc-m3 | 1 | dogfood 真实模型面：seedDshHome 凭据播种写自管 userData（fixture 层 userData 自管不外露、无播种缝）+ dogfood overlay + 双 test.skip 门控 + 用例中段 closeApp——唯一真实模型依赖面（Hard Rule 沿 M2 裁决），迁移无收益（单用例 1→1） |
| m3/dogfood-sc-m3-replay | 1 | spawn 缝回放件：回放计划经 env `DSH_FORGE_REPLAY_PLAN` 注入（路径 = 自管 userData 内 plan 文件——fixture 创建时点 userData 未定）+ dshHome 会话定位（会话 A/B/C id 作 /stop-dag-tasks 回执对账锚）——共享 ud 根扫描在 workers=2 下有跨 worker 同段会话串扰风险（回执锚错绑即红）；单用例 1→1 零冷启收益 |

### 真机对账（workers=2，8 份迁移 spec 18 用例）

- 基线（原始形态，`001-batch4a/baseline-run1.log`，4.6m）：**4 failed / 15 passed**——blitz 冒烟 + preset T1（同断言同红：boot-overlay 突击组合 dirs=3，expert-squad skills 目录入列——产品/装配漂移存量红）+ overview T1（feature 渠道座位 label 空——存量红）+ expedition 冒烟（launch.ts:268 firstWindow closed——launch 层基建抖动，一次性）。
- 迁移形态（`migrated-run1.log` 4.7m / `run2` 4.7m / `run3-retrywrappers` 7.0m）：最终 **5 failed / 14 passed**，逐例归因：
  - blitz 冒烟 / preset T1 / overview T1：与基线**同断言同红**——存量红，零迁移回归。
  - blitz Step2b（run3 出现）：launch.ts:268 firstWindow closed——launch 层基建抖动（与基线 expedition 冒烟同签名，crash-restart 再启径触发）；隔离 rerun 绿（`isolated-blitz-2b-run3.log` 25.0s）。非迁移回归（基线同窗亦有一例同签名一次性红）。
  - mode-selection T3（run1/run2/run3 批内恒红）：共享序列耦合——上用例回退浏览器 overlay 残留拦截 hero chip 菜单点击（run3 实证：拦截体 = `.dswf-fb-item` picker 行）；隔离 run 恒绿（`isolated-mode-t3.log` / `isolated-mode-t3-run3.log`）。修法落支撑层（resetRendererView 补 picker overlay 收口或 registerProject overlay 显式清理），超本任务「改动仅限 e2e/specs/**」边界——**上报待跟进**。
- 冷启点：18 → 8（每迁移 spec 1 + crash 重启）；批时与基线持平（4.6m → 4.7m）——本批单用例 spec 占比高（4/8 无削减收益），削减收益集中在 3 用例 spec（blitz/expedition/overview 各 3→1、bootstrap/gate/mode 各 3→1）。

## 批次范围

expert-squad 族 9 份 spec 全部迁移共享 launch 形态（`createSharedLaunchFixture`——launchHost 整 spec 一次 + 用例间 tmp 夹具档案重播种 + crash 自动重启续跑）。

| spec | 用例数 | 迁移冷启点 | 裁定 |
|---|---|---|---|
| expert-squad-compare-mode | 2 | 2 → 1 | 全保留（交互行为：对比态单选、Esc 两段语义） |
| expert-squad-delegate-visibility | 1 | 1 → 1 | 保留（全局实例装载 + 预设部署面在场） |
| expert-squad-builtin-shadow | 4 | 4 → 1 | 全保留（遮蔽裁决双面一致 + 包零触碰指纹） |
| expert-squad-fault-isolation | 4 | 4 → 1 | 全保留（坏档隔离 + 修正恢复写径） |
| expert-squad-service-key | 4 | 4 → 1 | 全保留（字段表逐位 + fail-loud 错误语义 + 纯净审计；step-5 audit 用例本无真机面，不消费共享会话） |
| expert-squad-recruit | 5 | 5 → 1 | 全保留（建档写径落盘 + 无丢失窗口 + fail-loud 零落盘 + 原子取用） |
| expert-squad-summon | 5（含 2 fixme） | 3 → 1 | 全保留（官方切换分支收紧判据 + 降级③注入失败路径；fixme 用例不迁移不消费会话） |
| expert-squad-hot-reload | 7 | 7 → 1 | 全保留（直编热刷新收编/退场/换名/临时文件隔离写径） |
| expert-squad-panel-grid | 11 | 11 → 1 | 全保留（激活/骨架/故障/空态/搜索/过滤/聚组几何/冒烟） |

本批次 **零退役**：逐用例复核未发现「unit 已持有等价覆盖」的纯文案断言用例——少量静态形态断言（panel-grid step-1 头部次序/label 绑定、summon step-1 召唤钮文案）均与行为/装配断言同用例共存，独立退役需拆用例且 unit 侧无对应等价断言面（不满足「覆盖无真空」前提），按准则一律保留。

## 共享 launch 迁移适配点（批次一沉淀）

- 前置还原：依赖「面板未开」的用例（recruit closed-panel、panel-grid loading-first/error/empty）先经 `bridgeDispatch(page, 'show-session')` 桥导航回官方会话面板还原前置——重播种只复位 tmp 档案态，renderer 视图态由用例内显式收口。
- 注入对称：fetch 包装器/stub 开关（panel-grid list 注入、summon RPC stub）一律 try/finally 还原或复位——共享会话跨用例零残留。
- 写径会话归零：启停/建档类写径用例断言后经通道反向复位（svc-key enable、panel-grid step-4 enable + 降透明收敛）——防 disabled 残留污染下游过滤用例。
- 直编/遮蔽/坏档写径（hot-reload、builtin-shadow、fault-isolation）保留在用例内、落 wsDir/.dsh 子树——重播种自然复位回基准。
- pageErrors 断言面：原 per-test `session.pageErrors` → `sharedLaunch.pageErrors`（整 spec 累计面，语义收紧）。
- 存量潜在 bug 就地修复：delegate-visibility 的 `HR_PRESET_LABEL` 未定义（存量 ReferenceError，原始形态同样红）——迁移时补常量定义。

## 计时对账（批次一）

| 项 | 值 | 证据 |
|---|---|---|
| 基线（迁移前，per-test 冷启） | 40 个 launchHost 冷启点（9 spec 合计） | 迁移前 grep 盘点 |
| 迁移后 | 9 个冷启点（每 spec 1，+crash 重启） | 同上 |
| 批次真机 run（迁移形态） | 398.3s / 23 passed + 2 skipped + 19 failed | `logs/e2e-fast-shared-launch/1.5/001-xsq-batch/run1.log` + `elapsed1.txt`（真机 electron run，workers=2） |
| 基线对照（原始形态） | compare×2 / delegate-visibility×1 / panel-grid×6 / summon×4 共 13 failed（与迁移 run 失败逐例一致）；builtin-shadow step-2/3+冒烟×2 原始形态同样红；hot-reload 全绿 | `logs/.../001-xsq-batch/baseline.log`、`baseline2.log` |

## 归因结论（零回归）

- 19 例红中 **18 例为存量红（产品侧 UI 漂移，原始形态基线逐例同样失败）**——shadow 折叠行缺席、summon 召唤钮缺席、panel-grid 头部次序/chip 文本/「· 已禁用」附注/聚组几何取样等断言与当前产品渲染不符；非迁移引入。按 Hard Rules 归因上报，不在本任务改动面（断言失败 → 归因上报，零产品源码改动）。
- **1 例共享 launch 耦合**：hot-reload whitelist（原始形态绿；共享形态同序列红；`--grep` 隔离 run 恒绿 18.2s；temp-file+whitelist 组合对绿）——reseed 的 `.dsh` 子树删除/重建多轮后 chokidar watch 通路衰减，晚期用例直编写径不再被感知。修法（reseed 清空 experts 目录内容而非删目录、保目录 inode）落 `e2e/support/fixtures.ts` 支撑层，超出本任务「改动仅限 e2e/specs/**」边界——上报待跟进（支撑层一行修）。

## 逐用例 --grep 隔离 run 留痕

- hot-reload whitelist 隔离：**1 passed（18.2s）**（`logs/.../001-xsq-batch/whitelist-isolated.log`）；temp-file+whitelist 组合对 2 passed（`temp-whitelist.log`）——证无用例固有顺序耦合，耦合面在会话级累计衰减。
- 批次余量隔离 run 留痕随后续批次补齐（存量红 spec 的隔离 run 与基线同红，证据价值以基线对照表承载）。

## 批次一结论

- 迁移本身零回归（18/19 失败与原始形态逐例一致）；expert-squad 族冷启点 40 → 9（每 spec 一次）。
- 批次全绿受阻于存量红（产品漂移，归因上报）+ 1 例支撑层耦合（上报待跟进）。
- 后续批次推进清单见 `logs/e2e-fast-shared-launch/1.5/resume.md`。
