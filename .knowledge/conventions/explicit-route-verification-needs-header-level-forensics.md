---
title: 显式 provider/model 路由验证必须 header 级真机取证且双通道各自取证
summary: 子会话「用了哪家的模型」不能靠 console/描述断言——必须取 request/header config 与 subagent descriptor 原文；对话式委派（通道一）通过不代表 worker claim（通道二）通过，两通道须各自取证。
keywords: [provider, model, 路由, 真机取证, header]
status: draft
source_container: expert-squad-forge-2
source_task: expert-squad-forge-2/1.21
---

# 显式路由验证 = header 级取证 × 双通道独立取证

## 规则

1. 凡 AC 断言「子会话按显式 provider/model 路由创建」，证据必须落到 request/header config（或 subagent descriptor 的 agentProvider/agentModel 字段）原文，不得以 UI 呈现、日志措辞或「装配健康」旁证替代。
2. 显式路由有两条消费通道——通道一（对话式委派 delegate_expert）与通道二（forge worker claim 组装）——组装链路不同，验证必须各自取证；任一通道通过不推定另一通道成立。

## 依据（本特性实证）

- 通道二反复翻车而通道一无关：fix-3 后真机仍回落父继承（bug 14984d4f → 8ec99bcb 陈旧 dist + 组装丢弃 → a599db30 settings.worker 前置拦截 → 131b5179），四轮才收口。
- 收口判据即 header 取证：r8 复测 hostlog 插桩 `route=...` + request/header config 摘录（walkthrough/retest-1.13-r8/evidence.md）。

## 消费点

review-proposal 检查项、验收清单模板（含 provider/model 面的提案）。
