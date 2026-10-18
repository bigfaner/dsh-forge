---
feature: "mobile-ui"
journey: "pairing-entry-mobile-view"
risk_level: "Medium"
surface_types: ["mobile"]
surface_keys: ["mobile"]
sources:
  - ".forge/docs/features/mobile-ui/prd/user-stories.md#US-1"
  - ".forge/docs/features/mobile-ui/prd/ui-functions.md#导航架构"
generated: "2026-10-17"
---

# Journey：配对进入独立手机视图

**用户故事**：US-1 配对进入独立手机视图（批次①）。

## 搭建前置条件

- 已配对的手机浏览器（移动 UA，390×844 视口）。
- 同一 host 上桌面 web-app 产物正常部署（用于零引用核查对照）。

## Happy Path

1. **用户用手机扫码完成配对** → 预期：浏览器进入 `/remote/`，加载 mobile 独立单文件产物，页面可交互。
2. **用户浏览加载后的页面** → 预期：呈现的是手机专属受限视图（对话主视图形态），非桌面 UI 的裁剪缩放分支；触屏交互（点击/滚动）即时响应。
3. **用户刷新页面** → 预期：同一单文件产物再次加载，视图恢复一致，无需重新配对（配对态保持）。

## 边界用例

1. **（引步骤 1）产物引用隔离**：分叉前置 = 检查手机产物资源引用 → 手机产物与桌面工程零模块引用（无桌面 bundle 资产被加载）。
2. **（引步骤 1）未配对直接访问**：分叉前置 = 浏览器无配对态打开 `/remote/` → 不进入对话视图，呈现配对引导/错误态，不出现半初始化 UI。
3. **（引步骤 2）桌面同 host 并存**：分叉前置 = 桌面浏览器打开同一 host 的桌面入口 → 桌面视图与手机视图互不影响，各自产物独立加载。

## Journey Invariants

- 手机产物为独立单文件工程，与桌面工程零模块引用；同一 host 双产物并存互不干扰。
- 手机视图是为触屏设计的完整体验，任何形态都不走桌面裁剪分支。
