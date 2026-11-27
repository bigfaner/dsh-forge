---
title: agent preset 子树行解析基座 = registry 服务 ctx（非声明插件 baseUrl）
summary: >-
  官方 AgentPresetRegistry.register 的 preset 子树行解析基座 = registry 服务自身
  ctx.baseUrl（agent-preset-registry 包所在目录），与声明插件 baseUrl 无关——preset
  行跨包解析成员包子路径前必须核销该基座可达性，否则导入失败整 preset broken。
keywords:
  - agent-preset-registry
  - preset
  - resolution-base
  - plugin-mount
  - dsh-forge
id: agent-preset-registry-ctx-baseurl
status: unconfirmed
version_ts: '2026-11-24T09:23:25.460Z'
updated: '2026-11-24T09:23:25.460Z'
type: facts
procedure: true
candidate_of: dirkey
slug_hint: preset-row-resolution-base-registry-ctx
---
# 官方 agent preset 子树行解析基座 = registry 服务 ctx（非声明插件）

# 结构事实

`AgentPresetRegistry.register(definition)` 的实现（官方 lib/index.js）：`const context = this.ctx` ——即 **agent-preset-registry 插件自身的上下文**；挂载时 `mountPreset(scope.ctx.extend({ baseUrl: record.context.baseUrl }), ...)`。preset 子树行的模块名解析基座 = **registry 包所在目录**，与调用 register 的声明插件（如 expert-squad）的 baseUrl 无关——声明方只是方法调用者，`this` 绑定服务对象。

推论：preset definition 里携带 `@dsh-forge/<member>/subpath` 形式的行名时，必须先核销「从 registry 包基座能否解析到该成员包」——bundle 安装布局（pnpm 嵌套物化）下成员包常不可达，导入失败 = 行 activation 失败 = 整 preset broken（设置页「加载失败」+ presetProbe 剔除 + 委派诚实降级）。

# 判例

- 2026-11-24 全专家 preset「加载失败」排查轮：初步误诊为解析基座不可达，真机定谳 operative 因是 restrict loud 校验（见 tools.restrict 掩码语义条）——但基座语义事实仍真，属**设计期前置核销项**（写 preset 行前先查可达性），非每次故障的第一嫌疑。
- 同族前案（2026-11-22 forge bundle preset 子树）：`!!js` 表达式基点 = profile 根，`@dsh-forge/*` 成员包不可达 → preset broken——混合锚 IIFE try/catch 双腿形收敛。

# 引用前核对

官方包版本升级可能改变 register/mount 语义——引用前核销当版 lib/index.js。
