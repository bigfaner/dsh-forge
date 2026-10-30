---
title: CDP 归因四轮对照法
summary: 官方组件内部行为归因的 CDP 探针方法：仪表化引发错误风暴 → 零仪表化对照轮排除脚本侧致因 → 只读监听 + 定间隔几何采样 → 竞态窗口收窄定谳；仪表化只能在对照轮之后叠加。
keywords: [CDP, 探针, 归因, 对照轮, 采样]
domainPath: .knowledge/examples/
来源容器: loop-consol-flywheel-improvement
来源任务: 1.4 CDP 归因；first-pass 复盘（1.9）沉淀
bug id: 无
---

# CDP 归因四轮对照法

以 loop-consol-flywheel-improvement/1.4（贴底跟随破坏归因）为范本：

1. **R1 仪表化轮**（失败样本）：patch scrollTop setter（defineProperty 自有属性）引发官方渲染器错误风暴（2419 例）并阻断组卡渲染——**教训：勿以自有属性改写官方对象内部状态面**。
2. **R2 零仪表化对照轮**：确认基线行为正常、排除 fixture/脚本侧致因——**仪表化探针的第一轮必须是零仪表化对照**。
3. **R3 监听 + 采样轮**：scrollTo 监听 + 200ms 几何采样（阶跃幅度、inProcess、offTarget、nearBottom 比率）——只读观测不侵入。
4. **收窄定谳**：官方源码路径与实测现象互证，排除次假设（inProcessRatio=0 四轮一致）与第三轨（节流不解决竞态窗口），锁定单轨修复。

证据归档形制：每轮独立子文件夹（probe-results.json / follow-timeline.json / 截图），双阶段脚本（PHASE=attribute|verify）同仓 `cdp/` 目录。
依据：`.forge/docs/proposals/loop-consol-flywheel-improvement/walkthrough/1-4-bottom-follow-attribution.md`。
