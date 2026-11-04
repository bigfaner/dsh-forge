---
title: 共享会话跨用例污染防护四式
summary: >-
  共享 launch 下重播种只复位 tmp 档案态，renderer
  视图态与宿主内存态跨用例存续——迁移时按四式收口：前置还原、注入对称还原、写径反向归零、pageErrors 升整 spec 累计面。
keywords:
  - e2e
  - 共享launch
  - 跨用例污染
  - 重播种
  - 注入还原
domainPath: .knowledge/conventions/
来源容器: e2e-fast-shared-launch
来源任务: first-pass 知识沉淀（1.13）；audit-panel-detail.md / audit-xsq-batch.md 批次一沉淀
bug id: 无
id: shared-session-cross-test-pollution-guards
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 共享会话跨用例污染防护四式

## 规则

共享 launch 形态中，夹具重播种只重建 tmp 档案（.dsh 子树）；页面 DOM 态与宿主内存态不被复位。迁移 spec 时逐用例核四处：

1. **前置还原**：依赖「面板未开 / 窄态」等视图前置的用例，先经桥导航（`bridgeDispatch(page, 'show-session')`）回官方会话面板还原——视图态由用例内显式收口，不指望重播种。
2. **注入对称**：fetch 包装器 / RPC stub / 捕获缓冲一律 try/finally 还原或每用例重置——防「零请求」断言被前用例残留串味；crash 重启新页面后包装器需重装。
3. **写径归零**：启停 / 配置类写径用例断言后经 UI 反向操作归零（如 disabled 位再启用）。注意 finally 的文件还原不回滚宿主内存态（patch 文件还原 ≠ 宿主重读），残留位会污染下游用例。
4. **断言面收紧**：per-test `pageErrors` 升为 sharedLaunch 整 spec 累计面（语义收紧方向，防漏报）。

另：写 tracked dev 档（`apps/host/profile.dev/cordis.patch.yml`）的 spec，中断轮会留残留毒化后续 run——跑批前 `git checkout --` 归零基线。

## 反例边界

- 直编 / 遮蔽 / 坏档写径落 wsDir/.dsh 子树者，重播种自然复位回基准，无需用例内归零。
- 若被测语义本身是「每次全新世界」（per-test 独立凭据/独立 userData），这属不相容面，走迁移判据保留原形态，不做本配方硬适配。

## 依据

试点 expert-squad-panel-detail 16 例全绿（221s）与批次一 9 份迁移零回归，均按此四式收口；判例：step-4 写径残留 disabled 位致下游 `get()` 400「expert disabled」。见 `.forge/docs/proposals/e2e-fast-shared-launch/audit-panel-detail.md`。
