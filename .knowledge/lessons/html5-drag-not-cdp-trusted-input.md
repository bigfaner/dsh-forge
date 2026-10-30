---
title: Electron HTML5 拖拽无法经 CDP Input 受信驱动——写通道取证降级用合成事件并记录边界
summary: CDP Input.dispatchMouseEvent 只覆盖指针事件序列，不支持 dragstart/drop 等 HTML5 drag 事件，真机拖拽无法走受信输入取证。降级路径：合成 DragEvent 走 React 委托面验证写通道（写回成功+重启持久），同时在走查记录中如实标注「非受信输入」边界，不粉饰为完整取证。
keywords: [CDP, 受信输入, HTML5 拖拽, 取证降级, Electron]
domainPath: .knowledge/lessons/
来源容器: project-manual-order
来源任务: first-pass 复盘（1.4）
bug id: 无
---

# 拖拽取证边界：合成事件非受信输入（walkthrough/batch1 判例）

翻车点：真机走查第 6 步要求「纯受信指针拖拽」取证，实际 CDP Input 面不支持 drag 事件序列——OS 级手势无法合成。

处置：

1. **降级取证**：合成 DragEvent 直达 React 委托面，验证「写回成功 + host 重启后持久」——写通道真机有效成立。
2. **如实标注**：走查记录明确写「使用了合成 DragEvent（非受信输入），纯受信指针拖拽未单独取证」，不冒充完整证据。
3. **样式证据改用计算样式票据**：拖拽行滚出视口截不到图时，以 getComputedStyle JSON 票据（ev6-dragging-styles.json）替代视觉截图。

教训：取证手段受平台边界限制时，正确动作是「等价证据 + 边界声明」，而非硬造不可达取证或静默跳过。
