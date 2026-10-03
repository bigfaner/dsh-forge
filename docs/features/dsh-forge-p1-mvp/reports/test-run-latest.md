# Test Report: dsh-forge-p1-mvp

**Date**: 2026-10-03（第三轮，fix-14/fix-15 落地后）
**Duration**: ~32m suite wall time（per-journey serial，workers=1，含 knowledge-browsing 一次偶发失败 + 全套重跑；另含跑前 NSIS 重打包 ~8m，见 Environment Notes）

## Summary

| Type | Total | Pass | Fail | Skip |
|------|-------|------|------|------|
| Web E2E / project-registration | 10 | 10 | 0 | 0 |
| Web E2E / project-registration-compensation | 8 | 5 | 0 | 3 |
| Web E2E / session-workbench | 7 | 6 | 0 | 1 |
| Web E2E / knowledge-browsing | 7 | 7 | 0 | 0 |
| Web E2E / knowledge-recall-flywheel | 9 | 5 | 1 | 3 |
| Web E2E / installer-smoke | 5 | 4 | 0 | 1 |
| **All** | **46** | **37** | **1** | **8** |

**Result**: 与前轮终态完全一致（37/1/8）——fix-14（原生目录选取桥）与 fix-15（品牌标记替换）零新增回归。唯一 fail 仍为登记在案的设计红（flywheel 冒烟 `[链口径·缺陷信号]` soft 组，6/6 错误均带标记、零非标记错误，勿修勿绕）；8 例留痕 skip 为 T-test-gen-scripts 阶段设计决策（各带转正条件），非本轮跳过。

---

## Confidence Rating

**Level**: high（与前轮持平：终态逐例对齐，含一次偶发 flake 的判别与收口）
**Confirmed Fact Ratio**: 45/46（37 pass + 8 documented skips with recorded conversion conditions；1 例为故意设计红）

### Verification Summary

| Mark | Count |
|------|-------|
| VERIFY | 37 |
| REVIEW | 1（flywheel 冒烟——设计红，缺陷信号载体，非缺陷疑点） |

---

## Results by Test Case

### project-registration — 10/10 passed（6.4m）
fix-14 回归面：向导走查经 `DSW_FORGE_DIRECTORY_PICKER=off` 归回退浏览器面，10 例全绿——表单相位 chip 迁移与回退面行级标记并存无断言褪色。

### project-registration-compensation — 5 passed / 3 skipped（2.2m）
与前轮一致（3 例留痕 skip：毫秒窗口/故障注入/重放通道）。

### session-workbench — 6 passed / 1 skipped（4.1m）
与前轮一致（Step6 项目级页签留痕 skip）。

### knowledge-browsing — 7/7 passed（4.4m，含一次偶发失败判别）
首跑冒烟 1 例败（`openKnowledgeView`：`[data-dswf-nav="knowledge"]` click 成功后 `[data-dswf-knowledge-view]` 30s 未挂载；快照证会话视图在场、kb-demo 已注册、无模态拦截）→ 单例重跑绿（36.9s）→ 全套重跑 7/7 绿。判别结论 = 非确定 boot/相位竞态 flake（fix-11 Step1c 同族：boot 后相位收尾窗内导航点击被吞），两次后续 boot 零复现；fix-14/15 变更面（add-project 流 + ForgeBrand/sidebar.css）与知识视图挂载路径无交集，非回归。

### knowledge-recall-flywheel — 5 passed / 1 failed / 3 skipped（5.1m）
与前轮一致：冒烟链路全程跑到尾（注册→会话→检索链→回答→轨迹→召回 tab→热度闭环→8b 累积断言均执行），仅败于 `[链口径·缺陷信号]` soft 组 6 断言（召回次数 1 vs per-call、行热度/K1 卡片热度、累积 2 vs 6、K2 徽章、K1 保持——全部带标记，零非标记错误）。

### installer-smoke — 4 passed / 1 skipped（4.7m，重打包工件）
跑前工件新鲜度对照发现 `release/installer/dsh-forge-0.1.0-win-x64.exe`（10-03 19:27）早于 fix-14（20:02）/fix-15（20:17）→ 预防性走正典管线重打包（20:30:49 落位；包内 `runtime/host-dist/ipc/directory-picker-channel.js` 与 web-dist 24×24 品牌 SVG 均验证在场）。NSIS 静默装 → exe 直启零错 → 冷重启同相位 → composer 20.0s（无模态拦截）→ fail-fast 检出。Step2b offline 留痕 skip（断网观察通道）。

---

## Failed Tests Detail

### flywheel 冒烟 — 设计红（缺陷信号载体，勿修勿绕）

- 断言源 `e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts:498-545`：`[链口径·缺陷信号]` 组 expect.soft 断「一次命中的检索链记 1 条召回/热度 +1/两链累积 2」，shipped 按 per-call 计。
- 与前轮逐例同形（6/6 错误全带标记）。处置不变：**非本轮回归、非生产缺陷疑点**；转正 = core 链口径产品裁决（M5+，contract tensions #1），两侧不可单改。

---

## Environment Notes

- 工件纪律（前轮教训的预防性应用）：跑前 mtime 对照发现 NSIS 工件陈旧（早于 fix-14/15），**先重打包再跑测**（前轮是败后才定位）；`pnpm build`（web dist 20:22）→ `pnpm dist:stage`（STAGE_OK files=26458，较上轮 +4——fix-14/15 新增文件）→ `electron-builder --win`（20:30:49）。重负载全部前置于 e2e 之前，跑测期间零并发负载。
- 环境红线遵守：全程未动 TMP/TEMP（继承用户 Temp）；本机 5 个 `DSH Desktop.exe` 为**另一产品**（dsh-forge productName = `dsh-forge`），p1mvp 套件临时 userData 互不持锁，全程零 single-instance 签名；跑前查无卸载器/残留 electron。
- 收尾：无泄漏进程；`.forge/test-state.json` 已按 teardown 流程移除；`Z:\dsh-forge-smoke` lane 残留（p1mvp-ud-* ×2、smoke-proj-fixture）已清。
- 运行日志：`/z/tmp/p1mvp-run3-01..06-*.log`（04b = kb 冒烟单例判别重跑，04c = kb 全套重跑）。
