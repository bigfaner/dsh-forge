---
title: 装配/provide 守卫必须原子幂等且失败留诊断痕迹
summary: check-then-act 形状的装配守卫会被并发重入击穿（同缺陷二次复发）；双次装配撞车导致整体降级 fail-soft 也不留痕，排查只能靠真机 persona=no 逐轮逼近——守卫须原子幂等，任何降级必须 emitDiag。
keywords: [装配, provide, 守卫, 幂等, fail-soft]
status: draft
source_container: expert-squad-forge-2
source_task: expert-squad-forge-2/1.21
source_bug: caaea320
---

# 装配守卫：原子幂等 + 降级留痕

## 现象

- forgeExperts provide 守卫被并发装配击穿，整体降级 expertResolver，通道二显式路由与 triage persona 同时失效——该撞车链 4 次复发（bug 763de653 → d327323b → dfa41a72 → 4f340789）。
- 反射探测守卫非原子（check-then-act），同缺陷二次复发（bug d269cf5a → 3cd58cad）。
- 降级全程 fail-soft 零日志，直到真机取证 persona=no 才暴露。

## 避免方式

1. provide/探测守卫用原子幂等短路实现（同 key 二次 provide 幂等返回，非拒绝降级）。
2. fail-soft 降级必须经 emitDiag 输出 warn/error（§7 可观测性纪律：不得以 fail-soft 为由静默失败）。
3. 同一守卫缺陷复发 ≥2 次时，停止打补丁，换幂等化方案。
