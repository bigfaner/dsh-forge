---
title: "壳层多窗口工程(窗口注册表 · window-role · fan-out)"
domains: [shell-windows, window-registry, window-role, fan-out, detached, title-authority]
---

# 壳层多窗口工程(窗口注册表 · window-role · fan-out)

## Shell Windows

### TECH-window-001: 壳层多窗口工程纪律(注册表 · role 零 URL 面 · 单一汇流 · 标题权威)

**Requirement**: 壳层多窗口(拆出视图为独立 OS 窗口)一律经**窗口注册表**(主窗 + detached 集;读侧一律 destroyed 活性过滤;liveWebContents 集为 fan-out 与 WS 逐窗注册输入面);窗口角色 = WindowRole 判别联合,**经 preload verb 握手、零 URL 面**——resolveWindowRole 输入仅 webContents 身份(「无从读取」落实禁 URL hash 纪律;未知/销毁 → null 兜底;漂移载荷严格形状守卫降级 main,渲染层永不因载荷漂移崩溃);detached 窗 = 同源 SPA 重载 + **同 SHELL_WEB_PREFERENCES**(contextIsolation/sandbox)+ will-navigate 锁 `dsh-app:`、window-open 拒;每窗事件推送 = 逐存活 webContents fan-out(订阅登记逐窗,destroyed 自动退订);carriage/WS 改写**改输入不改判定**(mainWebContentsId 单 id → shellWebContentsIds 存活集,主窗行为逐字不变有专项测试;主窗 createWindow 保持 byte-stable);OS 标题栏关闭 ≡ 收回由**单一汇流构造保证**('close'(几何记忆)→ 'closed'(registry 唯一移除口 + detached-closed 事件恰好一次),recall 不做独立清理路径,语义等价由构造保证而非对齐测试);**标题归主进程**——窗口标题是 BrowserWindow 状态,renderer 无标题动词;渲染层 document.title 申请经 page-title-updated 守卫挡下 + 重申主进程组装值(事件时点重算,状态追加分即时合并);windows/ 域模块**零 electron import**(DI seam:宿主窗口最小面注入,vitest 直入);删除联动 = **动词前落标**(markRemoved 前置于删除动词,规避批量推送晚于关窗事件的竞态);壳 → workbench 单向**可选 hook 注入**(recallProjectWindows/markDetachedWindowsArchived 走可选 deps——窗口面缺席时动词不受阻);boot 路由:hostless(无 dshForge)main() 同步执行(既有 boot 契约逐字保持)+ 真壳恰一次 getRole IPC 往返(WeakMap 按 face 记忆化)+ dispose 后到达的角色不装配(无僵尸 seat)+ detached 世界零 seat 双注册由构造保证(apply 路由只装单视图)。
**Context**: M4 T5 裁决(多窗口 = 壳层第二 BrowserWindow;原生 float = 应用内浮层非 OS 窗口;M1 spike-3 禁 URL hash 纪律);fix-3 标题权威修复(Electron 默认把渲染层 document.title 应用于 OS 窗题,vendored SPA 自设标题会盖掉主进程组装值);M5+/M6 新窗口形态(管线视图拆出等)沿用。
**Scope**: [CROSS]
**Source**: feature/dsh-forge-m4 TECH-009(design/tech-design.md §Interface 5;tasks/records/4.2、4.3、fix-3;apps/desktop/src/main/windows/)
