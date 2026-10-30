---
title: 显式配置被静默回落是三层同形缺陷——逐层剥离而非逐轮盲修
summary: 通道二显式 provider/model 路由丢失由三层同形「静默回落 inherit」叠加：陈旧 dist 装配滞后、组装期成对字段被丢弃、settings.worker 前置拦截——每层单独看都「像环境问题」，四轮才收口。
keywords: [路由, 回落, inherit, 显式配置, 分层]
status: draft
source_container: expert-squad-forge-2
source_task: expert-squad-forge-2/1.21
source_bug: 14984d4f
---

# 显式配置静默回落的三层形状

## 现象

fix-3 后真机仍回落父继承（bug 14984d4f），随后逐层剥出三层独立成因：

1. 生产装配路径跑陈旧 dist——装配链版本滞后（bug 8ec99bcb）。
2. triage 同族组装把 provider/model 成对字段丢弃。
3. 显式配置被 settings.worker 缺省值前置拦截（bug a599db30）。

## 经验

- 「显式配置未生效」优先按数据流逐层插桩（输入→装配→组装→消费），一次定位全链，而不是每轮修一层猜一层。
- 每层修复后必须在 header 级取证确认（见 convention：显式路由验证），否则只证明「该层不再丢」，不证明「端到端生效」。
