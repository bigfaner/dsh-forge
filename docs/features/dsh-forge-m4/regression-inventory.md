# dsh-forge M4 回归盘点定稿(P2 gate · 2.10)

> 权威输入:1.8 任务文件尾节《迁移清单逐行执行记录》(初稿)、tech-design §Testing Strategy/§Integration Specs #9、prd-spec §导航迁移清单(必答②)与 §Success Criteria、1.8–2.9 + fix-1 各执行 record。本文 = P2 收口定稿,亦为 P4 4.7 SC5 终验的对照基线(零缩水二次断言)。
> 执行日期:2026-09-29(2.10)。全量 e2e 终态:**384 测试 = 320 passed + 62 fixme(挂起台账,逐腿指针见下)+ 2 既有 skip,0 failed**;vitest 单测门 2109 passed + 2 skip 全绿。实例锁纪律:每批 launch 前探针,workers:1,真实 userData 逐腿隔离。

## 一、迁移清单七行逐行终验(必答②)

| # | 清单行 | 契约处理 | 终态 | 绿证据(spec × 计数) | 挂起腿与指针 |
|---|-------|---------|------|---------------------|-------------|
| ① | 全局导航 → 项目一级导航 | 一次性替换 | **执行完毕** | SC1 腿 `m4/sc1-project-nav.spec.ts`(二元切换 + panellist「项目」首项 + stale 键归一)+ `forge-workbench-nav/view-switch-smoke.spec.ts` + 孤儿视图清零三面(sc1 内 retired 面零残留/retired 三容器零挂载/逃生门内景恰一容器)+ base-smoke 改写腿 | 旧 chrome 方言腿 18 挂起:mpm 旅程 16 + m2 sc5 + overview-smoke(5.14)——断言锚定 ProjectSwitcher/TopBar/TabBar/旧向导内部件;替代证据 = SC1/SC2 腿 + 1.6 冒烟(m4-project-seat-smoke)+ 逃生门 overview 存活腿 |
| ② | M2 看板 → 保持独立视图(右栏 pane 形态) | 数据面零变更 | **执行完毕** | `openTasksBoard`/`openBoardPane` 重宿主(概览任务行 seam)后 42 腿 apps 侧 + m2 SC 腿全绿:task-board-browsing 10、task-session-execution-loop 9、dual-form-consistency 13、plugin-management 5、tasks-smoke(5.15)1、tests/m2 sc1/sc3/sc6/sc7 4;M3 侧 47 腿:task-dispatch-execution-loop 22、sc3-parallel-dispatch、sc5-prefs、sc7-dual-form、sc1-zero-cli、sc9 ×2、dual-form-transition 6、preferences 3、session-native 2、explicit-sot 2;断言本体零删改(节点全集/双通道 oracle/回流计时/FT-030 只读面逐字保留;FT-030 白名单改对拍产品 channel-allowlist 常量 —— 动词面系 M3/M4 Interface 1 设计增长,只读纪律由 forgeTree 基线 hash 承载) | 1 挂起:task-board-browsing step-1 empty-state(零任务语料无看板 UI 开口,见开放项 A) |
| ③ | M3 提案板 → 项目页 forge 文件区(右栏概览子 tab) | 收纳重组 | **执行完毕(pane 方言)** | SC2 全量腿 `m4/sc2-three-zone-full.spec.ts`:提案面目录行 + 状态 Pill + proposal/eval 开文档 tab(multiple)+ feature 互跳 chip 逐操作可达;仓外回流读数腿:out-of-repo smoke/step-3/step-4、sc9 ×2(提案行断言改 pane 方言 `data-dsh-forge-overview-prop-dir`) | 9 挂起:proposal-board-browsing 8 + sc6-proposals —— 断言锚定已退役 ProposalsPage 详情面(排序/状态流转菜单/eval 交叉跳转/lost 重指);替代证据 = M3 ProposalsPage 组件套件全绿(零修改)+ SC2 全量腿 pane 面逐操作 |
| ④ | M3 阶段资产面板 → 右栏概览子 tab | 收纳重组 | **执行完毕(feature 面)/ 有缺口(资产面)** | SC2 全量腿 feature 面:目录行 + 状态词表直透 + 文档行开文档 tab(canonical docKind 序);偏离徽标面 = DeviationBadge 在座;stage-gates 派发链腿(sc4 的看板门禁段)随 ② 绿 | 15+2 挂起:stage-gates-cross-phase-context 13、sc4、m2 sc4 —— 断言锚定已退役 Feature 详情步进器/阶段门/资产面板浏览面;**资产面板浏览面未承接**(开放项 B) |
| ⑤ | M3 文档根设置 → 三区位置选择器口径 | 承接既有文档根 | **执行完毕** | 存活向导腿入口统一 `[data-dsh-forge-overview-register]`(概览空态 CTA):sc2-migration 3 腿(含仓外显式授权)、explicit-sot 19、out-of-repo 10、sc9 ×2、sc1-zero-cli(C7 前身向导链)全绿 | 1 挂起:out-of-repo step-2 多项目注册门腿(向导方言) |
| ⑥ | M3 发起链 → 原位保留(挂接写入不变) | 数据面零变更 | **执行完毕** | 派发链 22 腿(task-dispatch-execution-loop:prompt_hash 四检 oracle/stub 通道/审批/claim/submit 回流 ≤5s 逐字)+ ② 行全部派发消费腿;追加行两行化断言 = sc7-task-session-trace 命名行在场 | 无 |
| ⑦ | M1 会话主面 → 代码区会话列表(同底座) | 复用不重写 | **执行完毕** | M1 九根规格零改动全绿(shell/shell-fallback/shell-ui/tray ×2/protocol-carriage/sc3-footprint/sc6-update/sc7-smoke/uf4-recovery + version-consistency 三腿;chunk A 计 170 passed)+ 非 forge 旅程 178 形态沿用 | 无 |

孤儿视图清零(e2e 全量路由归属):SC1 三面 + base-smoke 改写腿 + 1.7 view-key/shell 单测 —— 2.10 复跑维持全绿。

## 二、M1–M3 既有 e2e 全绿基线(2.10 改写后终态)

- 终态计数:**384 = 320 passed + 62 fixme + 2 既有 skip,0 failed**(playwright `--list` 与分块全量复跑对账;desktop-e2e 258 = 222+36,forge-m3-e2e 126 = 98+28)。
- 1.8 初稿基线 381 = 230 passed + 151 skipped → 2.10 恢复 **87 腿**(挂起 149 → 62;新增 SC2 全量腿 1、sc2 布局腿维持 2);另修复 m2 sc1/sc7/tsel 姊妹腿随批次全绿。
- 分块全量复跑(每块全绿,workers:1,launch 前实例探针):A(M1/chrome 家族)170+3skip;B(看板家族 + m2 SC)37+4skip;C(dual-form + 挂起家族存活腿)15+29skip;D1(M3 SC + m4)17+2skip;D2(dual-form-transition/explicit-sot/out-of-repo/preferences)48+3skip;D3(proposal/session-native/stage-gates/dispatch)33+23skip。
- vitest 单测门:132 文件 2109 passed + 2 skip(42.9s)—— 含 2.1 双宿主几何零缩水、2.3 pane 面四态机、2.4 文档/依赖图套件。
- 恢复期的四处宿主方言改写(断言本体零删改口径内的「入口/寻址」面):①看板列表行单元格定位改行尾倒序索引(选择 cell 自 M2-3.9 起常驻,前缀索引漂移);②FT-030 白名单 16 动词快照 → 产品 `WORKBENCH_VERB_CHANNELS` 常量对拍(动词面系 Interface 1 设计增长);③提案行/文档根断言选择器改 pane 方言(`data-dsh-forge-overview-prop-dir` / 概览空态 CTA);④注册位 store 推送:fixture 注册与裸 card-activate 后补同值 `renameProject`(纯 DB,发 project_list_changed —— 右栏宿主绑定的 active-project store 仅按该推送重读)。

## 三、SC8 废止口径(落档)

SC8(feature 阶段感知)已于 2026-09-27 裁决 #27 废止:UF4 阶段感知视图裁撤,任务面板保持 M2/M3 看板独立形态(不从属 feature),阶段感知增强不做;执行中任务 → subagent 会话通路由 SC7(任务详情 dock 形态)承载,「未挂接会话」标注随 UF5 dock 呈现。M4 不再有任何 SC8 验收腿;P4 4.7 SC5 终验清单 = SC1–SC7(零 SC8)。

## 四、开放项(对齐 tech-design Open Questions;P4 4.7 对照输入)

- **A. 零任务语料的看板直达开口**:看板 pane 的唯一 UI 开口 = 概览任务子 tab 行 seam(select + ensureBoardActive)—— 零任务语料(含 files-authority 无 index.json 的未迁移树)概览任务面零行,看板 pane 无入口;task-board empty-state 腿与 out-of-repo step-3 legacy 腿因此挂起。前置:看板 tab 的直达开口(逃生门概览「任务」入口或 4.3 拆出窗口形态)落地后恢复。
- **B. 阶段资产面板浏览面未承接**:右栏 pane 族(概览 feature 子 tab = 目录树 + docKind 文档行)不含 M3 阶段资产(stages/*.md)浏览面;阶段资产仍由派发预合成(stage summary 要素)与偏离徽标消费,但「浏览最新内容」无 UI 宿主 —— stage-gates-cross-phase-context 13 腿 + sc4 + m2 sc4 挂起的主因(步进器/阶段门腿另锚定已退役详情面)。归宿裁决(概览 feature 面扩 stages 行 vs 文档 tab 扩 kind)留 P4/M6。
- **C. 旧向导/ProjectSwitcher 方言腿(18 + 1)**:mpm 旅程、m2 sc5、overview-smoke、out-of-repo step-2 的断言锚定 M2/M3 旧向导与换台 chrome 内部件;M4 原位换台生命周期已由 SC1/SC2 腿 + 1.6 冒烟承载,旧方言腿不恢复(无宿主),保留为 SC5 零缩水盘点的「替代证据已档」行。
- **D. 板内「进入会话」open-failed 呈现**:2.10 修复了板内 orchestration「进入会话」在死会话 id 上的未处理 renderer rejection(现经 wiring 层 catch 吸收,通道仍按 ERR_SESSION_OPEN_FAILED 拒绝);C5 行级 [打开] 已有 open-failed toast,板内入口的 toast 面未接(ui-design C5「不静默」口径)→ M6 收口。
- **E. tech-design Open Questions 原项**:偏好/插件面正式归宿(用户裁决「暂时忽略」2026-09-28;过渡 = 逃生门 overview,入口 = 概览 tab 行尾设置链)、`sidebar.workspaces` 单槽覆盖机制核对(本设计即自绘口径)、C6 注入座位(已裁定 conversation.input.dock 回退座位,2.7 落地)、e2e subagent 血缘语料 stub 协议(2.9 已落地)、顺延记账(20 技能 → M6;四 CLI 动词 GUI 归宿 → M5/M6;影子 git + runtime_root → 存储实现里程碑)。
- **F. 已归档会话恢复口径**:M4 范围内归档仅作用于项目(workspace 保留 + forge 侧归档分区);「已归档会话」的恢复面(C8 设置页裁撤后)未落正式归宿 —— 与 E 的设置面归宿同批裁决。
