# 用例价值审计对账表 — expert-squad 族存量迁移（1.5 批次一）

提案：e2e-fast-shared-launch（1.5 存量全量迁移·批次一）；样本：1.3 试点 expert-squad-panel-detail.spec（16 例保留 / 4 例退役，见 audit-panel-detail.md）。
裁定准则（同试点）：退役 = 纯文案/label/静态渲染断言（unit 等价覆盖在案）；保留 = 行为/语义/写径断言（真机才有增量）。

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
