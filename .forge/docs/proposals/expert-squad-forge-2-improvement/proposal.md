# 提案：expert-squad-forge-2 修正波次越阈改进（expert-squad-forge-2-improvement）

- **parent_proposal_id**: expert-squad-forge-2（uuid 87811db3-2cf7-47dc-97cb-9fcebc334377，注册时由 createProposal 填写）
- 来源：expert-squad-forge-2 first-pass 复盘（任务 1.21）
- 指标基线：一次通过率 1、返工增量比 0.0%、**修正波次 46（≥ 阈值 6，越阈）**、fix 密度 55.6%

## 1. 越阈归因

返工增量比 0——结构性返工已被评审拦在拆解前；46 波次修正集中在实现/验收期的四类反复翻车点（bug 台账实证）：

| 翻车点 | 复发链 | 收口状态 |
|---|---|---|
| 装撞车降级 fail-soft 零痕迹（persona/路由双双沉默失效） | 763de653→d327323b→dfa41a72→4f340789 | caaea320 幂等化收口 |
| triage persona 缺席逐轮排查 | 64f155fe→b16dcdf6→ad32e240→1343ca22 | 已收口（fail-loud） |
| 显式 provider/model 路由三层静默回落 | 14984d4f→8ec99bcb→a599db30→131b5179 | r8 header 取证收口 |
| 提交产物 BOM/坏字节阻塞 pnpm 全链 | 9e2fc7ef、98e3e249（跨容器再现） | 已修，无机械守卫 |
| 停止径批量转移扫穿 terminal 终态 | a8fbe860 → 3ccb4e96 | 已修；同族 e4b2d921 / 5a245dd1 仍 open |

## 2. 改进项

### 2.1 验收清单增补「显式路由/档案合成」取证判据（压修正波次主项）

- 改进：凡 AC 含显式 provider/model 路由或 persona 档案合成断言，验收清单强制两判据——①证据落 request/header config 或 descriptor 原文（非日志措辞）；②通道一/通道二各自取证。判据正文见 `.knowledge/conventions/explicit-route-verification-needs-header-level-forensics.md`。
- 落点：`packages/plugin-forge-spec/skills/breakdown-tasks/SKILL.md` 验收清单段。

### 2.2 提交产物字节守卫（压 fix 密度）

- 改进：契约测试补一条「关键 package.json 无 BOM、可 JSON.parse」守卫断言（`packages/core` 现有 selftest 族挂靠），坏字节在门内拦截而非 pnpm 全链爆炸后人工排障。
- 落点：selftest 契约测试文件（实现时定 file 粒度）。

### 2.3 循环停止径残留收口（open bug 清账）

- 改进：a8fbe860 同族两 open——异常终局遗留 in_progress 有界滞留无人认领（e4b2d921）、pause 径唤醒绕过 wakeupKeys 去重（5a245dd1）——并入循环停止径一次性收口（terminal 过滤判据见 `.knowledge/conventions/batch-state-transition-skips-terminal.md`）。
- 落点：`packages/core/src/forge/` 循环/claim 域（实现时核实到 file 粒度）。

### 2.4 提炼态 convention 晋升裁决

- `.knowledge/conventions/batch-state-transition-skips-terminal.md`、`.knowledge/conventions/assembly-guards-atomic-idempotent-with-diag.md` 申请晋升 `docs/conventions/` 正本（随本提案裁决，不直改）。

## 3. 验收

1. 含显式路由断言的提案评审命中新判据（正向：判据在场；负向：仅日志措辞证据 = Blocker）。
2. 契约守卫对植入 BOM 的样例 fail、对现行仓内 JSON pass。
3. e4b2d921 / 5a245dd1 终态收口（fixed 或有界滞留机械承接），复发链不再增长。
4. 2.4 两 convention 晋升状态随裁决落库。
