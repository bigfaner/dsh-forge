---
title: 官方 tools.register 拒收不合方言的 output.schema——工具静默缺席
summary: >-
  官方 ctx.tools.register 用受限 JSON Schema 方言校验 output.schema：type 只能是单个类型字符串（可空用
  oneOf），object 节点必须显式布尔 additionalProperties——违反即注册被拒、工具静默缺席（同插件其余工具正常，只有一条
  error 诊断）。桩注册面的单测拦不住；定义工具的包应 pin @deepseek-ai/dsh-tools 为
  devDependency，用官方校验器本体写契约测试。判例 2026-11-27：project 0.41.0 的 forge_dirs /
  forge_resolve_path 在桌面宿主消失。
keywords:
  - tools.register
  - output.schema
  - json-schema方言
  - oneof
  - additionalproperties
  - 工具注册
  - dsh-tools
  - 静默缺席
  - 契约测试
id: tools-register-output-schema
status: unconfirmed
version_ts: '2026-11-27T16:03:50.619Z'
updated: '2026-11-27T16:03:50.619Z'
type: pitfalls
candidate_of: forge-pluginization-architecture
---
# 官方 tools.register 会拒收不合方言的 output.schema——工具静默缺席

## 症状

宿主里某两个工具整体消失，同一插件注册的其余工具正常；没有任何可见报错。宿主日志里也查不到——插件把注册异常记成一条 error 级诊断后继续装配。

判例（2026-11-27）：`@dsh-forge/project` 0.41.0 装进桌面宿主后，`forge_dirs` 与 `forge_resolve_path` 不见了，`record_bug` 等照常。

## 根因

官方 `ctx.tools.register`（`@deepseek-ai/dsh-tools` 的 `ToolsService.register`）调用 `assertSupportedJsonSchema(output.schema)`，用的是一套受限 JSON Schema 方言，不认识的写法直接抛错。实测被拒的两条：

| 写法 | 方言要求 |
|---|---|
| `type: ["string", "null"]` | `type` 只能是单个类型字符串；可空用 `oneOf: [{type:"string"},{type:"null"}]` |
| `additionalProperties: { type: "string" }` | object 节点的 `additionalProperties` 必须是显式布尔；动态键对象用 `true` |

方言允许的键（按节点类型）：标注键 description / title / default / examples；object 另有 type、properties、additionalProperties；array 另有 type、items；标量另有 type、enum、const；另有 oneOf（至少两支）。`parameters` 不走这套方言（另一个对象 schema 校验，`enum` 可用）。

## 为什么单测没拦住

工具注册面的单测用桩代替 `ctx.tools.register`，桩只记录定义、不校验 schema。全绿放行，问题直到真机才暴露。

## 规避

1. 工具的 `output.schema` 按上表写；每个 object 节点都写显式布尔 `additionalProperties`。
2. 定义工具的包，把 `@deepseek-ai/dsh-tools` 加进 devDependencies（精确 pin），用官方校验器本体写契约测试：对每个工具定义跑 `assertSupportedJsonSchema(definition.output.schema)` 与 `assertObjectJsonSchema(definition.parameters)`。先例：`plugins/project/host/tools/forge-paths.schema.test.ts`。
3. 契约测试里同时钉住「违规写法确被官方所拒」，防止上游放宽后测试空转。
4. 定位这类问题时，用有求必应的 ctx 桩装载构建产物，再拿注册到的定义去过官方校验器——比翻宿主日志快。

## 边界

- 校验只针对 `output.schema` 与 `parameters`；`render` 等不在其内。
- 版本敏感性：方言随 `@deepseek-ai/dsh-tools` 版本变化，以 devDependency pin 的版本为准，升级上游时该契约测试会第一时间报出来。

## 溯源

提交 `04621dd1`（`@dsh-forge/project` 0.42.1）；真机判例见提交说明。相关既有条目：工具注册门的 zod schema 子集净化（同一道门，角度是 zod 产物净化）。
