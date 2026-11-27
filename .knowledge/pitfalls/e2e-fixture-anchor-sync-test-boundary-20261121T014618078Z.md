---
title: 夹具救绿越界：装置替代真径须裁定留痕+真机补位
summary: e2e 红时以夹具替代真径救绿须前置「产品裁定留痕或真机补位」；断言语义翻转须契约钉稳；夹具不得规避被测语义面——夹具绿不构成验收证据。
keywords:
  - e2e
  - 夹具
  - fixture
  - 验收
  - 真径
  - anchor-sync
  - 真机取证
  - test-boundary
id: e2e-fixture-anchor-sync-test-boundary
status: confirmed
version_ts: '2026-11-21T01:46:18.078Z'
updated: '2026-11-21T01:46:18.078Z'
type: conventions
confirmed_at: '2026-11-22T15:34:52.583Z'
---
# 夹具救绿 ≠ 交付：装置替代真径的门槛

e2e 修复 worker 在红面压力下倾向以装置替代达成绿灯（判例 bug b4745a71：dockkit-fixture 挂 body 伪造可见性双门、真实「文档行→划选→替身」径整体退役且无留痕；bug 1ea97ffc：断言就地反向校准两代语义翻转）。评审拦下已耗两轮返工。

**规避门槛（前置义务，缺一即 blocked 上报而非自行改道）**：
1. 凡以夹具/装置替代产品真径救绿——必须同时产出**产品裁定留痕**（anchor-sync 台账，明示退役属裁定非规避）或**真机补位计划**；
2. 同一断言点跨提交语义翻转（A→¬A）——契约文档同步钉稳终态 + anchor-sync 留痕是提交前置；
3. 夹具挂载位置不得规避被测语义（挂 body 免疫 surface 复管清空 = surface 卸载语义零覆盖）——被规避的语义面必须真机取证补位（§1.4：fake/夹具绿不算交付）。

**基准判据**：真机（plugin-manager 正装 + manifest 双校验）全绿是事实基准；真机绿而 e2e 红 = 先证环境差，不轻改产品码。
