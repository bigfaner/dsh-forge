---
id: "fix-2"
title: "Project package runtime data (presets/assets/patch-yml) into the vendor closure"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: false
type: "coding.fix"
---

# Project package runtime data (presets/assets/patch-yml) into the vendor closure

## Root Cause

「新会话」点击无响应(live 验收发现): vendor 闭包投影规则只收 src/**, 包内运行时数据全部缺失。agent-presets 的出厂预设(standard/cordis/minimal/ptc)不在 SHIPPED_PRESET_ROOT(<pkg>/presets/), 宿主预设注册表为空, sessions.create 以 `agent-preset/not-found: preset "standard" not found (available: none)` 拒绝; 上游 UI 对该失败仅 console.warn(`new session failed:`), 用户侧表现为点击无任何反应。同类缺失: skill-office/skill-badge assets、subprocess-local scripts、bundle cordis.patch.yml(此前由 install-host-closure ad-hoc 拷贝, gitignored)。

## Fix

类修复: scripts/sync-upstream.mjs 投影规则纳入 presets/、assets/、scripts/、根级 *.patch.yml、LICENSE → lock +32 文件(2222); .gitignore 删除对应 ad-hoc 排除规则(现为 lock 跟踪的提交内容); vendor-project 重投影 + install-host-closure 重装 + build-upstream-web 重建 dist。

新增 scripts/acceptance/live-ui-probe.mjs(诊断探针)与 live-ui-sweep.mjs(全量交互验收, 14 项, 含真实模型回合) — e2e fixture 栈跑在假宿主上, 证明不了此类真链路缺陷。

## Verification

- live-ui-sweep --send: 14/14 PASS(新会话创建、预设菜单、侧栏、插件/设置面板、深浅色切换、搜索、历史会话、访问/模型菜单、右侧栏、输入、真实发送 4.5s 回复)
- 修复前探针证据: `new session failed: SessionCreateError ... agent-presets: preset "standard" not found (available: none)`; 修复后同一点击零告警、standard 预设装载

## Acceptance Criteria

- [ ] vendor/upstream.lock.json 含 packages/preset/agent-presets/presets/**(10 文件, sha256 校验)
- [ ] 点击「新会话」后宿主创建会话成功(渲染侧无 `agent-preset/not-found` 告警), 会话 UI 挂载
- [ ] live-ui-sweep.mjs --send 14/14 PASS

