---
title: 隔离夹具内归属模型自主处置不可约束
summary: 真机走查夹具中，归属会话的模型对 followup 消息自作处置（误判容器、停循环、自行重启），状态窗口被淹没且压制手段（切模型/掐 owner 轮）不彻底——状态窗口类断言的走查预案必须声明模型约束方式。
keywords: [走查, 夹具, 归属模型, 自主处置, 状态窗口]
domainPath: .knowledge/lessons/
来源容器: loop-consol-flywheel-improvement
来源任务: 1.5 真机走查会（001/002/003 三轮复现）；first-pass 复盘（1.9）沉淀
bug id: 无
---

# 隔离夹具内归属模型自主处置不可约束

- **现象**：循环由 `/run-dag-tasks` 正门启动后，归属会话模型对 followup 消息自作处置：调 `taskStats` 误判容器、调 `stopTaskLoop` 停循环、再自行 `dispatchTask` 重启——001 轮 t+13s 即被停；002 轮 8 分钟内 103 次 terminal→running 回翻；003 轮徽标 18 分钟恒 running，三态窗口被重启淹没。
- **已试无效**：模型切换（菜单定位落空）、owner 生成轮掐断（首轮回翻消失，后续 notice 轮仍触发重启）。
- **教训**：徽标机械本体正常时，走查 FAIL 的根因可能在取证环境不在产品码——先分环境干扰与断言失败，再谈修码。
- **预案**：断言依赖状态窗口稳定的走查，用强指令遵循模型档，或人工值守会话 + 暂停 ask 应答路径取证。
- 依据：`.forge/docs/proposals/loop-consol-flywheel-improvement/walkthrough/ac-1-6-verdict.md`（AC4 环境干扰记录）。
