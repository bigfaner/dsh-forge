---
id: "disc-1"
title: "Shell fallback document for blank-boot paths"
priority: "P1"
dependencies: []
status: 
type: "coding.enhancement"
---

# disc-1: Shell fallback document for blank-boot paths

白屏缺陷修复:当上游 web dist 缺失/载入失败或宿主处于终态失败时,dsh-app:// 返回内嵌最小壳文档(不依赖上游资产),保证 shell-ui 挂载点存在 → UF4 恢复覆盖层与错误引导可见(替代白屏)。含 e2e:dist 缺失场景下窗口显示失败态覆盖层而非空白。关联:3.3 注入管道设计(等待上游 boot 门才挂载是根因之一);F1-G/SC 错误路径引导。

## Acceptance Criteria

- [ ] 上游 web dist 缺失时壳内呈现 fallback 文档(SHELL_FALLBACK 日志可见)
- [ ] boot gate 以预解析形式内嵌, shell-ui 复用已存在的 #dsh-forge-shell-root
