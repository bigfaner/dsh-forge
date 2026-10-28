---
title: 官方 smooth 追底动画在飞窗口的 settle 释放窗
summary: 官方 chat-view 贴底跟随的释放窗 = smooth 追底动画在飞期间内容增高阶跃（>25px 容差）落地，settle() 落点超容差即释放；补落底修复须以「增高前偏离 ≤ 容差」为守门判据，用户已上滚不拉拽。
keywords: [bottom-follow, followingTail, settle, smooth 滚动, 容差]
domainPath: .knowledge/lessons/
来源容器: loop-consol-flywheel-improvement
来源任务: 1.4 CDP 归因定谳；first-pass 复盘（1.9）沉淀
bug id: 无
---

# 官方 smooth 追底动画在飞窗口的 settle 释放窗

- **官方机械**（dsh-client-ui-chat lib/client.js 0.2.0-rc.2）：贴底判据 `useScrollFollow(state.followingTail, 25)`；贴底态追底走 instant jump（可吸收阶跃），偏离 >25px 或动画在飞走 smooth scrollTo（target 一次锁定不重 target）；`settle()` 实际落点距 `min(target, floor)` >25px → 跟随释放且不再自愈。
- **释放窗**：「反复原地增高」（短窗多阶跃）恰落动画在飞窗口即触发释放——低竞争下 instant jump 全吸收，故问题只在高频增高场景复现。
- **修复守门**：组卡增高后补一发 instant 落底，判据 = **增高前**偏离 floor ≤ 25px（官方同源容差）；用户已上滚（> 容差）不拉拽。补落底的 scroll 事件经官方采样使 following 重 arms，自愈释放态。
- 依据：`.forge/docs/proposals/loop-consol-flywheel-improvement/walkthrough/1-4-bottom-follow-attribution.md`。
