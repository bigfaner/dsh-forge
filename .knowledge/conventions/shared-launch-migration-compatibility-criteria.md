---
title: 共享 launch 迁移判据：冷启削减 + 生命周期相容
summary: >-
  e2e spec 迁移共享 launch fixture 的两条判据——冷启点有削减（≥2 用例）且用例语义与共享生命周期相容；单用例 1→1
  零削减不抵对账成本，强依赖独立 app 生命周期的 spec 结构性不相容，一律保留原形态。
keywords:
  - e2e
  - 共享launch
  - fixture
  - 迁移判据
  - 生命周期
domainPath: .knowledge/conventions/
来源容器: e2e-fast-shared-launch
来源任务: first-pass 知识沉淀（1.13）；裁定实录 audit-xsq-batch.md 批次二a至六
bug id: 无
id: shared-launch-migration-compatibility-criteria
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 共享 launch 迁移判据：冷启削减 + 生命周期相容

## 规则

spec 迁移共享 launch 形态（launchHost 整 spec 一次 + 用例间 tmp 夹具重播种 + crash 自动重启）前过两条判据：

1. **收益判据**：冷启点有削减（≥2 用例）。单用例 spec 1→1 零削减，不抵真机对账成本，一律保留。
2. **相容判据**：用例语义不依赖独立 app 生命周期。以下特殊面与共享 fixture（用例间不 closeApp、userData 自管不外露）**结构性不相容**，整份保留原形态：
   - 用例中段 `closeApp` + 同 userData 复启（双重启旅程即被测语义，如 remote-approval-journey、host-boot）
   - launch 前向自管 userData 播种（dogfood 凭据 seedDshHome、forge-settings.json 预写、state.db 预置/篡改——fixture 层无播种缝）
   - 依赖零项目 fresh boot 的断言（全表计数、hero 空态——共享 beginTest 自动注册先落行且跨用例持久）
   - 安装/打包形态（NSIS 安装链、dist 重建 + exe 直启）
   - 跨 worker 共享文件的播种/还原（共享会话下播种窗污染并行 worker 装载面）

## 反例边界

- 相容的 spec 若有跨用例残留风险，走污染防护配方迁移（见同目录 shared-session-cross-test-pollution-guards），不据此保留。
- 「全表计数断言」可按 feature slug 收敛作用域或由声明序首用例承载，属可适配而非不相容。

## 依据

e2e-fast-shared-launch 全量收口：103 份 spec 盘点，迁移 49 / 在案保留 33 / 单用例判据保留 16 / 余量上报 5；迁移族冷启点 154 → 50，全量批 864.5s（红例收缩后较上轮降 54.5%）。逐份裁定与理由见 `.forge/docs/proposals/e2e-fast-shared-launch/audit-xsq-batch.md`。
