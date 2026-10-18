# 批次② 交付摘要：read-state 口径 + forge:proxy 通道 + 抽屉/hero（mobile-ui 阶段 2 · 任务 1.10–1.13）

- 日期：2026-10-19 · 分支：mobile-ui（worktree `.forge/worktrees/mobile-ui`）
- 口径：每任务单条交付事实 + commit hash + 证据索引；G4 对照按批次②范围逐条标注。
- read-state 现行口径（R12 终版）：**未读游标 = 手机页 localStorage（`dshf.mobile.read.<pairDomain>`），host 不建 read-state 面**；提案期 lastSeen 服务端游标为已撤销候选，仅留痕。

## 1. 交付清单

| # | 任务 | 交付 | commit |
|---|---|---|---|
| 1.10 | read-state 撤销段回写（文档口径统一） | tech-design AD-6 重写为 localStorage 口径（AD-7 撤除、3 处 mermaid 同步撤除）；api-handbook §1.1 read-state/§4.1/§4.2 撤除、「增 4 通道」改写；er-diagram/schema.sql 作废登记留痕；prd 族 + screen-map + tech-research/tunnel-psk 全部对齐 R12 | 347c7fe3 |
| 1.11 | forge:proxy 通道族 + PSK v3 + forge-stream（host 侧） | proxy-channels.ts（session 12 方法/commands/user-questions 直调 + projects-grouped + approval 别名 + disconnect 对偶 + file 分块）；psk.ts/psk-gate.ts（PSK v3 密码核 + 准入门）；forge-stream.ts（加密 SSE 镜像帧化核）；remote-http-rpc 挂表 + PSK 隧道域拦截器（唯一 401 owner）。定向 4 套件 58 测试绿；host vitest 850 过 / 2 既有失败（真实 electron spawn 环境，基线复核同败） | 47d655b7 |
| 1.12 | 屏④ 抽屉会话列表 | createDrawerView：项目分组折叠 + 双级未读徽标（项目级+会话行，localStorage 游标）+ worker 折叠子组 + 连接弹层（状态/通道/断开钮）+ 检索态；数据通道 `forge:proxy/projects-grouped` 单呼；e2e `e2e/mobile/drawer-unread.spec.ts`（双级未读最终一致 + 断开通道）exit 0 | a028871f |
| 1.13 | 屏⑤ 新会话 hero | createHeroView：proj 徽标 + logo/问候 + composer（模式 chip + 分支/worktree chip）；建会话双径（默认分支 → `session.create`；非默认 worktree → `forge:worktree/session-create`，host 建会话守卫单门）；乐观切换回执驱动（守卫拒绝 → widgets/confirm 确认框，选回/仍要切换）；模式映射突击=steer/远征=queue；hero.test.ts 控制器状态机 14 项，apps/mobile 166 项全绿 | 3076443b |

任务文案 `session-grouped` 为 1.1 录制期旧名，host allowlist 正名 = `forge:proxy/projects-grouped`（1.12 走查已核销）。`forge:remote/session-links` 预检延后（api-handbook 1.2 可选项，1.13 不实现）。

## 2. 走查证据索引

| 证据 | 位置（留盘不进 git） |
|---|---|
| 1.10 逐项核查记录 | logs/mobile-ui/1.10/001-doc-rewrite、003-verify（record.md） |
| 1.11 门禁证据 | logs/mobile-ui/1.11/001-proxy-psk（record.md） |
| 1.12 屏④ 逐位对照 | proposals/mobile-ui/walkthrough/1-12-drawer/（walkthrough-record.md + impl-screen-4 四图：drawer/connpop/disconnected/search）；探针 logs/mobile-ui/1.12/001-drawer/ |
| 1.13 屏⑤ 逐位对照 | proposals/mobile-ui/walkthrough/1-13-hero/（walkthrough-record.md + impl-screen-5 五图：hero/bwpop/confirm/revert/modepop）；探针 logs/mobile-ui/1.13/001-hero/ |

走查取证人形 = Playwright chromium 设备模拟（390×844 触摸、iPhone UA、deviceScaleFactor 2）+ 真组件装配 fake 馈送；基准 `proposals/mobile-ui/mobile-ui-mockup-final.html` 屏④⑤。

## 3. PRD G4 对照（批次②口径）

G4 =「各屏与 UI 定稿逐位一致（真机逐位对照 mobile-ui-mockup-final.html）」。

| 屏 | 批次②结论 | 证据 |
|---|---|---|
| 屏④ 抽屉会话列表 | ✅ 逐位一致（设备模拟口径）：默认态/连接弹层/断开回执/检索态四状态面与 mockup 屏④对照一致；worktree 徽标不渲染（grouped 响应 worktrees[] 丢弃，mockup 亦无承重形态） | 1-12-drawer 四图 + walkthrough-record.md |
| 屏⑤ 新会话 hero | ✅ 逐位一致（设备模拟口径）：默认态/分支弹层/守卫拒绝确认框/选回回退/模式弹层五状态面对照一致；确认框无预检说明文本（session-links 预检延后所致，形态差异已留痕） | 1-13-hero 五图 + walkthrough-record.md |
| read-state 语义 | ✅ 现行口径验收：未读游标 = 手机端 localStorage 双级对账（打开拉取 + 轮询 + 触底归零），非提案 lastSeen 服务端旧词；host 不建 read-state 面 | 1.10 文档回写（347c7fe3）+ drawer-unread e2e exit 0 |

注：G4 正本判据为「真机逐位对照」，本批次取证为 Playwright 设备模拟（浏览器环境）；真机逐位取证属 T4 取证门统一收口面，与批次① G1 扫码/断线取证同一处理。

## 4. 遗留与移交

- 远程控制 dialog UI（桌面 web 面）1.11 未含，移交后续批次。
- DPAPI safeStorage 在 ELECTRON_RUN_AS_NODE 下不可用——psk-gate 留 wrap/unwrap 缝，默认 0600 文件边界。
- forge-stream 隧道封帧 v1 简化（comm 级密钥 + 查询串 sid/epoch），mobile 侧接入时按 tunnel-psk §4.1 收紧。
- 主检出与 worktree 两棵 `.forge/docs` 文档树漂移（worktree git 为准待回灌）。
- 真机逐位取证（G4 正本口径）→ T4 取证门统一收口。
