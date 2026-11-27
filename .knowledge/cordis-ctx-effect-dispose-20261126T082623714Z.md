---
title: cordis ctx.effect 回调立即执行：直接写 dispose 会让登记挂上即被撤销
summary: >-
  cordis 的 ctx.effect(fn) 会立即执行
  fn、其返回值才是注销器；把注销调用直接写进回调会让登记挂上即被撤销且无报错，消费侧只看到「取值非对象」降级。成对的登记/注销一律写
  ctx.effect(() => () => dispose())，并用生产同一反射面装载做变异验证。
keywords:
  - cordis
  - ctx-effect
  - disposer
  - reflect-provide
  - 注销器
  - 登记
id: cordis-ctx-effect-dispose
status: unconfirmed
version_ts: '2026-11-26T08:26:23.714Z'
updated: '2026-11-26T08:26:23.714Z'
type: pitfalls
candidate_of: quote-plugins-architecture
---
## 结论

cordis 的 `ctx.effect(fn)` 会**立即执行 fn**，fn 的**返回值**才是注销器。把注销调用直接写进回调，等于登记刚挂上就被撤销，且没有任何报错。

## 错误写法与正确写法

```ts
// 错：disposeDirKeys() 当场执行，登记立即失效
ctx.effect(() => disposeDirKeys())

// 对：回调返回注销器，宿主在 fiber 退出时才调用
ctx.effect(() => () => disposeDirKeys())
```

## 触发场景

经 `reflect.provide` 登记服务或目录键后，想随 fiber 生命周期自动注销。

## 症状与判别

- 登记方自己看起来一切正常；消费侧拉取到的是空值或非对象，报「取值非对象」「该名零贡献」之类的降级。
- 单测可能通过而真机失败：若测试用的是手写反射面而不是生产的 provide 路径，就测不到这个时序。

## 规避

- 成对的登记/注销一律用「返回注销器」的形态。
- 登记类用例要用与生产相同的反射面装载（真 cordis Context 走正式入口），并做一次变异：把 effect 改回当场执行，用例必须变红。

## 溯源

- 来源容器：forge-dirs-unification
- 来源任务：5.1；bug 83729990
- 证据：提交 605c45dd；真机日志 `.forge/probes/forge-dirs-unification/4.2-web/boot.log` 的 `dirKeys.expert_squad 取值非对象` 降级行
