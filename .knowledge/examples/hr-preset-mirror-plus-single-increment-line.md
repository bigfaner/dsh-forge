---
title: 角色 preset = 全量镜像 + 单增量行 + scoped restrict 承担权限
summary: HR 预设底稿以 standard 全量镜像为基，唯一差异一行 config.restrictTools.deny=[delegate_expert]——权限面由官方 scoped tools.restrict fail-closed 承担，preset 不自建权限机制。
keywords: [preset, restrictTools, scoped restrict, HR, 镜像]
domainPath: .knowledge/examples/
来源容器: expert-squad
来源任务: 1.23（phase-4-summary.md）
bug id: 无
---

# 角色 preset = 全量镜像 + 单增量行

## 判例

- `hr.patch.yml`：preset-hr / id `hr`，persona（招聘·管理 SOP）+ standard 底稿全量镜像，唯一增量 `config.restrictTools.deny=[delegate_expert]`。
- 白名单外工具由官方创建窗口 scoped `tools.restrict` fail-closed：prompt schema 不可见且调用被拒——插件/预设不二次实现过滤。
- 契约 pin：presets.test / overlay.test / assemble-tools 测试锚定底稿渲染与工具面接线。
