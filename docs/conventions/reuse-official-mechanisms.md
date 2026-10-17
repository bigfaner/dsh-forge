# 复用优先：不自造机制（用户裁决 2026-10）

## 裁决

**不要自己造机制，优先复用官方 dsh 的机制。** 需要一项能力时，先到官方包源码（核销基准见 `official-mechanics-interception.md` 与官方仓库检出）查证官方是否已有同语义机械；有则复用（import / inject / 装配），没有才允许自建——且自建须显式记录「官方为何没有、为何不能扩 official」的裁决依据。

## 判据

1. **查证先于设计**：设计任何新面（服务、通道、状态、缓存、生命周期）前，先枚举官方同语义机械（ctx 服务键、事件、slot、loader、plugin-manager 等）并核销其适配性。
2. **同语义即复用**：官方已有同语义组件/机械一律用官方件，产品层只做组合与注入（与 UI/engineering alignment 裁决同构，扩至 host/插件侧）。
3. **自建须留痕**：确需自建的机制，在提案/技术设计中记录「官方缺什么、为何不补官方而自建」；无此记录的自建面视为漂移。
4. **装配面同理**：插件与宿主的缝合优先走官方缝（cordis inject 服务键、官方 loader、plugin-manager 安装通道），不发明平行注入机制。

## 现状先例

- git-worktree 插件装配缝迁移（`worktree-assembly-portability` 提案）：依赖解析统一 cordis `inject` 官方服务键，取代 host 手工 Face 注入——本裁决的适用实例。
