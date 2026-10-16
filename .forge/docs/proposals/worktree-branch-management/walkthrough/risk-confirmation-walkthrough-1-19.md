# 1.19 真机走查：切换分支风险确认框 + cwd 三重纪律

任务：worktree-branch-management/1.19。e2e 载体：`e2e/specs/worktree-risk-confirmation.spec.ts`
（真 git 仓夹具：主树检出 main + wt-a 检出 feat-a；真机 electron + 官方 primitives 实装）。

## 走查结论（全数通过）

| AC | 走查面 | 实测结果 |
|----|--------|----------|
| hero 改选跨分支先弹确认框 | 主树 main → 选 feat-a 行 | 官方 RiskConfirmation 弹出（跨分支风险确认标题 + 知悉勾选 + 确认钮禁用至勾选）；截图 `hero-risk-dialog.png` |
| 取消保持原选 | 弹框点「取消」 | chip 恒 `main`，零编排（无挂靠会话产生） |
| 确认才走挂靠编排 | 勾选知悉 → 「确认继续」 | chip 切至 `feat-a` |
| 同分支重选不弹 | feat-a → 选 main 行（= 主树检出分支） | 无弹框直接切换 |
| 新建基准跨分支先弹 | 分支 `feat/new`、基准改 feat-a ≠ main → 创建 | 同款确认框弹出；截图 `create-risk-dialog.png` |
| 取消不进 git | 弹框「取消」 | list RPC 清单不变（无 wt-new） |
| 确认才进 git | 勾选 + 确认 | `wt-new` 出现于清单 |
| 零 checkout | 建树 + 挂靠 + 会话切换全程后 | 主树 `rev-parse --abbrev-ref HEAD` 恒 = `main` |
| 挂靠会话 cwd 强制（真机） | `session-create` RPC 预铸挂靠会话 | 落盘 session_projcache 快照 cwd = wt-a 根（SessionHeader.cwd 定死）；官方存储按 cwd 分组——session-\<id\> 目录落 `…-wt-a--` 组；该 cwd 下 `git rev-parse --show-toplevel` = wt-a 根 |

## cwd 强制证据链（真机）

1. **建立面**：预铸配方 `persistence.create({cwd: worktreePath})` + `controller.create({sessionId, cwd})`
   ——快照文件 cwd 字段实测 = worktree 根。
2. **守护面**：`readLatestAttach` → `assertSessionCwdMatches`（归一比对）→ 漂移抛
   `SessionCwdMismatchError`（单测锁：真 JSONL 持久化 + 漂移头显式报错）。
3. **实测面**：会话存储目录按 cwd 分组落在 `wt-a` 组 + 会话 cwd 下 `rev-parse --show-toplevel`
   = wt-a 根（pwd 语义面）。

## 过程修正（走查发现的真实缺陷，非叙事归档）

- 新建表单竞态：弹窗打开后 branches RPC 异步到达触发表单整体重置，用户输入中途被清空——
  改为重置只在 open 跳变沿 + defaults 到达仅在未输入时回填基准分支（create-worktree-dialog.tsx）；
  装配面 branches 数据不变时保持旧引用（WorktreeFaces.tsx）。
- 官方 RiskConfirmation 封装不传 `disabled`（官方 disabled 连带禁用知悉勾选框会死锁；
  「勾选前确认钮不可用」由官方内部语义承载）。

证据留盘：`logs/worktree-branch-management/1.19/001-risk-confirm/`（不进 git）。
