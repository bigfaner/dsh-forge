---
title: 角色 preset = 全量镜像 + 单增量行 + 插件守卫微件承担权限
summary: HR 预设底稿以 standard 全量镜像为基，唯一差异一行插件 config.denyTools=[delegate_expert]——权限面由插件 scoped apply 内官方 tools.restrict({deny}) fail-closed 承担，restrict 缺席/抛错 fail-soft warn 不拖垮 preset mount；preset 不自建权限机制。
keywords: [preset, denyTools, scoped restrict, HR, 镜像]
domainPath: .knowledge/examples/
来源容器: expert-squad
来源任务: 1.23（phase-4-summary.md）
bug id: 无
---

# 角色 preset = 全量镜像 + 单增量行

## 判例

- `hr.patch.yml`：preset-hr / id `hr`，persona（招聘·管理 SOP）+ standard 底稿全量镜像，唯一增量 `config.denyTools=[delegate_expert]`（插件 config 守卫微件态——preset 域实例行）。
- 生效面（fail-closed）：插件 apply 在 preset 域 scoped 上下文内调官方 `ctx.tools.restrict({deny})`——被 deny 的 inherited global 工具（delegate_expert）在该组合 prompt schema 不可见且调用被拒；插件/预设不二次实现过滤。
- 降级面（fail-soft）：`tools.restrict` 缺席或抛错（如 deny 命名未知 global 工具）仅 warn，不拖垮 preset mount——生效面与降级面两层口径分开表述，不混写。
- 契约 pin：presets.test / overlay.test / assemble-tools 测试锚定底稿渲染与工具面接线。
