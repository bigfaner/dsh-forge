# 用例价值审计对账表 — expert-squad-panel-detail.spec

提案：e2e-fast-shared-launch（1.3 试点）；基线：改造前最近一次全绿 run 总时长 ~15 分钟（20 例，每例冷启 + 30s 盲等窗）。
裁定准则：退役 = 纯文案/label/静态渲染断言（unit 等价覆盖在案）；保留 = 行为/语义/写径断言（真机才有增量）。

## 裁定总览

20 例 → 保留 16 例、退役 4 例；退役例 unit 覆盖无真空，零补测文件。

| # | 用例 | 裁定 | 归属层 | 依据 |
|---|---|---|---|---|
| 1 | step-1 success：点卡开 Dialog | **保留** | e2e | 真机交互行为（卡片点击 → Dialog 呈现 + 背后网格在场） |
| 2 | step-1 disabled-expert | **保留** | e2e | 禁用通道写径 + 灯/meta/按钮三面真机联动 |
| 3 | step-2 success：查看态五段渲染 | **退役** | unit | 纯文案/段标断言 → `panel-detail.test.ts`「查看态分段：简介/人设/工具 chips/技能 chips；派发路由 = 头部右上角 chips」+「头部（灯/名称/标识 chip/编辑钮）+ meta 行」 |
| 4 | step-2 markdown-render | **退役** | unit | 静态渲染断言 → `panel-detail.test.ts` personaBlocks「标题/列表/段落分块 + 行内加粗与行内代码」+「围栏代码块分块」+ Dialog 渲染分段用例 |
| 5 | catalog candidates | **保留** | e2e | 真机宿主 ToolRuntime 目录透出（读口 200 + delegate_expert + skills 非空） |
| 6 | step-3 success：编辑态预填/排序/候选 | **退役** | unit | 预填/排序/零 name 输入位/maxlength 均静态面 → `panel-detail.test.ts`「startEdit → 编辑态预填草稿」「multi-select：工具白名单在上、技能在下」「[name × *] 不可写」「岗位 Input + 简介 textarea（120 上限）」「toolCandidatesOf：目录清单含插件追加工具」；真机目录透出由保留的 catalog candidates 用例持有 |
| 7 | step-3 skill-add-local | **保留** | e2e | 草稿语义（未保存零 update 请求 + 档案零变更）真机写径 |
| 8 | step-3 cancel-discard | **保留** | e2e | 关闭重开草稿丢弃（零持久化）真机行为 |
| 9 | step-4 success：保存落盘 | **保留** | e2e | 核心写径（update 载荷 + cordis.patch.yml 落盘 + 卡片即时同步） |
| 10 | step-4 validation-empty-title | **保留** | e2e | 真机失败路径（字段报错 + 零请求零落盘） |
| 11 | step-4 validation-bare-mustache | **保留** | e2e | 真机失败路径（裸 {{ 拒绝 + 零请求） |
| 12 | step-4 update-failure | **保留** | e2e | 通道拒绝失败路径（stub 注入 + 修正后 success） |
| 13 | step-4 description-limit（120 截断） | **退役** | unit | maxlength 属性断言 → `panel-detail.test.ts`「简介上限常量 = 120」+「简介 textarea（120 上限）」 |
| 14 | step-4 route-only-save | **保留** | e2e | 写径分流（纯路由保存零 update + 来源 chip 保持内置——bug dea323c9/7ca12bc8 真机取证面） |
| 15 | step-5 disable-success | **保留** | e2e | 新写径落盘（experts.disabled 配置位 + patch 落盘 + 四位同步 + 零启停路由消费） |
| 16 | step-5 enable-success | **保留** | e2e | 位摘除写径（disabled 位归缺 + 四位归位） |
| 17 | step-6 close-x | **保留** | e2e | 关闭交互 + 零变更请求真机语义 |
| 18 | step-6 close-esc | **保留** | e2e | Esc 关闭 + 草稿丢弃真机行为 |
| 19 | step-6 close-overlay | **保留** | e2e | 遮罩关闭/内部点击不误关真机交互 |
| 20 | 冒烟（happy path 全程） | **保留** | e2e | 旅程冒烟（开→查看→保存→禁用→关闭 + 零 pageerror） |

## 共享 launch 迁移要点

- fixture：`e2e/support/fixtures.ts` createSharedLaunchFixture（1.2 产物）——launchHost 整 spec 一次 + 用例间 tmp 夹具档案重播种 + crash 自动重启续跑。
- 适配点：fetch 拦截包装器每用例重装（crash 重启新页面）+ 捕获缓冲每用例重置（共享会话跨用例残留防「零请求」断言串味）；面板导航收敛抽为 openPanel 每用例执行。
- 配置写径用例会话内归零：step-4 success / route-only-save / disable-success 在断言后经 UI 反向操作（岗位回档 + 勾选增量摘除 / 再启用）——experts 条目配置半是来源级（dev profile patch，跨工作区），finally 的 patch 文件还原不回滚宿主内存态；残留 disabled 位会污染下游用例（`get()` 400「expert disabled」、视图 tools 被 `cfgEntry?.tools ?? scanned.tools`（registry.ts buildEntry）整组替换为空）。UI 归零使内存与还原后文件语义一致。
- close-esc 断言改基线参照：以本用例打开时的 meta 为档案现值锚（前序用例改档后重播种，面板缓存重扫存在时序窗），「草稿丢弃 = 重开与编辑前一致」语义不变。
- 冒烟保存断言带失败路径诊断（捕获缓冲 + Toast/错误快照，仅失败时输出）。
- 运行环境纪律：本 spec 落盘写 tracked dev patch（`apps/host/profile.dev/cordis.patch.yml`），中断轮（kill/崩溃）会留残留条目并毒化后续所有 run（含 `disabled: true` 层条目）——跑批前 `git checkout -- apps/host/profile.dev/cordis.patch.yml` 归零基线。
- 退役 4 例逐用例 unit 映射见上表；补测文件：无（覆盖无真空）。

## 计时对账

| 项 | 值 | 证据 |
|---|---|---|
| 基线（改造前） | ~15 分钟 / 20 例 | 提案 §需求 实测分解 |
| 改造后整 spec run | **221 秒（3.7 分钟）/ 16 例全绿** | `logs/e2e-fast-shared-launch/1.3/001-full-run/run8.log` + `elapsed8.txt`（真机 electron run，workers=1） |
| AC 门槛 ≤ 8 分钟 | 达标（≈46% 门槛） | 同上 |

## 逐用例 --grep 隔离 run 留痕

16 例逐例 `--grep` 隔离 run 全部 EXIT=0（AC8——证无用例顺序耦合）：
`logs/e2e-fast-shared-launch/1.3/002-grep-runs/grep-batch1..4.log`（每例 15-39s，最慢 route-only-save 35.7s）。
