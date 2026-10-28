---
title: 等效证据口径：视觉件不可达时的替代取证
summary: 真机取证中视觉件（元素截图/状态徽标）不可达时，以 DOM 锚 + aria 断言 + 持续采样读数为主证据、回放轨视觉件归档为等效证据，不以视觉件强求（零 spec 改动纪律）。
keywords: [等效证据, DOM 锚, aria, 采样, 走查取证]
domainPath: .knowledge/conventions/
来源容器: loop-consol-flywheel-improvement
来源任务: first-pass 复盘（1.9）；口径产生于 1.5 真机走查
bug id: 无
---

# 等效证据口径：视觉件不可达时的替代取证

- **主证据**：DOM 锚（如 `data-dswf-session-loop="running"`）存在性断言 + aria 断言（e2e spec 全绿）+ 长时段持续采样读数（如 422 样本徽标读数）——机械可验证、可复跑。
- **等效证据**：目标视觉形态以回放轨（回放驱动到目标状态）截图归档留痕，替代真机实时捕获。
- **纪律**：不以视觉件强求；截图仅作场景留痕不作主证据；主证据与等效证据在判定记录中分层写明。
- 依据：`.forge/docs/proposals/loop-consol-flywheel-improvement/walkthrough/ac-1-6-verdict.md`（AC4 证据注记，主会话终裁 2026-10-28 采用）。
