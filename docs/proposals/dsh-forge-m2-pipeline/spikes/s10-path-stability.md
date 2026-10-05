---
created: "2026-10-05"
related: "../db-schema.md#§7-14"
status: "done（结论闭合）"
---

# S10 spike：canonical path 字符串稳定性（hash8 产物比对）

> 排程锚：db-schema §7-14（PRD 前 spike）。问题 = 同一物理目录经不同路径形态注册时，canonical 化后字符串（→ flatten+hash8 目录名）是否恒同——不稳定 = 同一工作区裂成两个 forge.db（孤儿库风险）。可执行探针 = [`spikes/m2-s10-path-stability/probe.mjs`](../../../../spikes/m2-s10-path-stability/probe.mjs)（自建夹具自清理；subst/junction 无需管理员）。

## 方法

- 双口径归一实测：**js realpath**（`node:fs/promises` realpath = core `canonicalizeDir` 现行为）与 **realpathSync.native**（GetFinalPathNameByHandle——真值拼写候选对照）。
- 每形态算 `{flatten}-{hash8}`（§6-34 规则：sha-256 前 8 hex 小写，输入 = canonical 串本机原样），组内收敛判据。
- 三组形态：A = tmp 夹具（原样 / 全大写 / 混合大小写 / junction / subst 盘符互为变体）；B = 本 worktree 真工作区（原样 / 全大写）；C = %TEMP% 夹具 8.3 短名段（`FIXTUR~1` vs 长名——Z: 卷未产短名，C: 卷实测）。

## 结果（2026-10-05，Windows / Node 24）

| 组 | 形态 | js realpath | native | 组内 key 收敛 |
|---|---|---|---|---|
| A | 原样 / 全大写 / 混合大小写 / junction / subst(Y:) | 全部 → `Z:\project\dsh\tmp-redesign\s10\fixture-proj` | 同左 | ✅ 同 key（`...-f1fddd51`） |
| B | worktree 原样 / 全大写 | 全部 → `Z:\project\dsh\dsh-forge\.forge\worktrees\redesign`（真值小写拼写） | 同左 | ✅ 同 key（`...-f56235cf`） |
| C | 长名 / `FIXTUR~1` 短名段 | 全部 → 长名真值 | 同左 | ✅ 同 key |

**总判：全部实测形态收敛——hash8 稳定**。具体发现：

1. **js realpath（core 现行为）即够**：大小写变体归一为磁盘真值拼写（含盘符）、junction 展开、subst 盘符**展开为底层路径**（libuv 解析 DOS 设备映射，实测 `Y:\fixture-proj` → `Z:\...\fixture-proj`）、8.3 短名展开为长名。native 口径结果逐字相同，无切换必要。
2. subst 的收敛是**超出预期的正面发现**（预判其可能残留映射盘符）：subst 形态注册不会裂库。
3. Z: 卷未启用 8.3 短名生成（`dir /x` 无产物）——本机主仓卷上该风险面天然不存在；C: 卷实测短名亦收敛。

## 结论与落点

- **S10 通过，无新增防线需求**：hash8 输入在 core 现有 `canonicalizeDir`（realpath fail-soft）下已稳定，裂库风险面收窄为「目录被真实移动/改名」（hash8 必变——F10-① 找回机制领域，M2 裁决 = 疑似移动拒绝注册 + 手工指引，已有兜底，无需改）。
- PRD 落点：无新增需求项；SC2「部署位置断言含消歧后缀」可按 §6-34 规则直接断言。
- tech-design 落点：派生函数（flatten+hash8）输入 = registry/ws_path 口径的 canonical 串（realpath 真值拼写）即可，无二次归一需求（与 path-key「比对口径非落库形态」边界一致）。
