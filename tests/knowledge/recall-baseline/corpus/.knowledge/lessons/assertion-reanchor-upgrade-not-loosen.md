---
title: 断言重锚纪律——重锚是判据升级不是放松，禁 text/正则/位置锚，二态断言让漂移不翻红
summary: >-
  断言重锚 = 「判据升级」：结构锚/data 属性 + 状态后效；禁 text/正则/位置锚。二态 if/else 断言使漂移不翻红（panel-grid
  判例）；放松面必须随附互证断言并留痕裁决依据。
keywords:
  - assertion
  - reanchor
  - e2e
  - 漂移
  - panel-grid
status: unconfirmed
source_container: e2e-known-reds-triage
source_task: 1.1–1.6 / 1.8 triage
source_bug: bf719481
id: assertion-reanchor-upgrade-not-loosen
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 断言重锚纪律判例

## 规则

1. 重锚的正确定性是**判据升级**，不是放松标准——新锚必须比旧锚更贴近被验证的不变式。
2. 合法锚形态：结构锚 / data 属性 + 状态后效（断言行为结果，不只断言渲染结果）。
3. 禁止：text 锚、正则锚、位置锚——三者均随无关变更漂移，且漂移方向不定。
4. **二态 if/else 断言是反模式**：两个分支都算通过时，目标元素漂移/消失不会翻红（panel-grid 判例：元素缺失走 else 分支静默通过）。断言必须单态，缺失即失败。
5. 任何放松面必须随附**互证断言**（从另一面证明同一不变式），并留痕裁决依据（为何放松、由谁裁决）。

## 边界

适用于 e2e / 走查断言编写与红转绿处置；单元测试的纯值断言不涉及锚形态问题。
