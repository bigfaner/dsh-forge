---
title: 内置件配置面挂 plugins.item 注册缝——判据、双缝并存与三条死路
summary: >-
  产品内置件新增用户配置面时，正门是 client bundle apply 期向 `plugins.item` list slot
  自注册条目（官方四件同构），详情页透传既有 configForms section、零新表单；有配置面才注册，配
  `configForms.whileServed` 门控防死链。与既有 `plugins.detail.section` 缝 fresh id
  并列注册、互不独占。三条死路勿重走：OPTIONAL_BUNDLES 注入（launcher 硬编码）、readOnlyReason
  借旗（protectsManager 硬编码 17 包保护集）、dsh.profile.bundles 可管理化（与防误卸载裁决相撞）。
keywords:
  - plugins.item
  - 内置件
  - configForms
  - whileServed
  - 双缝并存
  - 死路核销
domainPath: .forge/docs/proposals/builtin-plugin-item-presentation/recipe.md
来源容器: builtin-plugin-item-presentation
来源任务: >-
  1.10（first-pass 知识沉淀；配方出自本容器 recipe.md，机制正本
  probes/2026-11-builtin-plugin-manageable-presentation.md）
bug id: 无
id: builtin-plugin-config-face-plugins-item-slot
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 内置件配置面挂 plugins.item 注册缝

## 惯例

- **挂接判据**：内置件具备用户可达的 configForms section 才挂 `plugins.item`；无配置面不注册（避免空详情页）。
- **注册形态**（官方四件同构，dsh-client-ui-plugin-manager `client.js:3342-3344/:3384`）：apply 期 `slots.inject('plugins.item')` 注入条目（名称/图标/order/detail config section），order 与官方件并列（官方 subagent 30、expert-squad 40），不挤占。
- **`configForms.whileServed` 门控**：对应服务不在场即条目消失，不产生死链。
- **双缝并存**：`plugins.item`（内置件配置入口）与 `plugins.detail.section`（bundle 形态配置入口）fresh id 并列注册，挂同一 configForms 时复用同一 section 组件，读写径一致。
- **不变量**：表单复用、读写径走官方 configForms settings describe 域（已落盘值无缝继承、保存无需重启）、装载面零改动（呈现面与装载面解耦）。

## 三条死路（勿重走）

| 死路 | 核销依据 |
|---|---|
| `OPTIONAL_BUNDLES` 注入 | dsh-app-boot `lib/index.js:552-557`：launcher 硬编码四件 experimental 包，宿主不可注入且语义强制默认关 |
| `readOnlyReason` 借旗 | dsh-plugin-manager `lib/types/index.js:788-801`：唯一 bundle 级赋值路径 `protectsManager` 命中官方硬编码 17 包保护集，无外部注入点 |
| `dsh.profile.bundles` 可管理化 | 使内置件落入可开关/可卸载面，与「host 单点装配、防误卸载」裁决相撞 |

## 边界

- 适用于**随 host 发版内置**的插件件；用户层可安装 bundle 仍走 `plugins.detail.section` 缝。
- 本条为提炼态（domainPath 指向提案 recipe.md）；晋升 docs/conventions 正本走提案管线裁决，不直改技能检查项。
