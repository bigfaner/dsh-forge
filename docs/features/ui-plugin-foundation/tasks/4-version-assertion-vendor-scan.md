---
id: "4"
title: "版本一致性自动断言与产物级 vendored 扫描"
priority: "P0"
estimated_time: "3h"
complexity: "high"
dependencies: [1]
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.feature"
mainSession: false
---

# 4: 版本一致性自动断言与产物级 vendored 扫描

## Description
npm dist-tag `latest` 停在旧版 `0.0.1-rc.1` 而现行线在 `alpha`(0.1.6-alpha.2),裸装或 `^` 会静默拿到旧契约——版本对齐目前纯靠人工。本任务建立机器化断言:显式枚举比对集,对齐线依赖 exact ≡ `vendor/upstream.lock.json` 的 `desktopHostVersion`,错配即红灯;并以同源机制扫描插件构建产物模块来源(任何模块解析至 vendored 树即红灯),接入既有 CI/质量门,为工程模板盖版本戳。

## Reference Files
- `docs/proposals/ui-plugin-foundation/proposal.md` — Constraints & Dependencies(上游锁定)、Success Criteria(SC3、SC1 产物级校验)、Key Risks(dist-tag 陷阱)
- `vendor/upstream.lock.json` — `desktopHostVersion` 比对基准 (ref: Constraints & Dependencies)
- `package.json` — 质量门/脚本接入点(scripts 编排) (ref: Success Criteria)
- `tests/smoke.spec.ts` — vitest 编排参照(断言测试化挂接点)

## Acceptance Criteria
- [ ] 断言显式枚举比对集:对齐线依赖(`@deepseek-ai/dsh-client-*` 宿主契约族)exact ≡ `UpstreamLock.desktopHostVersion`;cordis peer 单列为独立版本线(仅校验 exact 锁定,不参与对齐比对)
- [ ] 红灯复现并归档:人为错配对齐线依赖版本 → 断言失败(测试或脚本输出留档)
- [ ] 绿灯:当前对齐线依赖 exact `0.1.6-alpha.2` == `desktopHostVersion` 且 cordis 不误报
- [ ] 产物级 vendored 扫描并入同一门禁:扫描插件构建产物的模块来源,任何模块解析至 `vendor/` 前缀或 `file:` 协议指向仓内即红灯
- [ ] 断言接入既有 CI/质量门;同源机制为工程模板(任务 7)盖版本戳,模板流出侧版本同步可见、可断言

## Hard Rules
- 禁止为通过断言而放宽比对集;借 `alpha` tag 定位须解析并锁定为 exact 结果后比对。

## Implementation Notes
- 实现载体(CI 步骤 vs 质量门 hook,原列 tech-design 待决,quick 模式本任务内定):建议 vitest spec + package.json script 双形态,定夺后留档理由。
- 断言红灯即上游升级提醒,不静默;上游 SHA 升级时断言与插件依赖同 diff bump。
