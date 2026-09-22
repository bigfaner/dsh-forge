---
title: "隐私与网络面(零遥测基线)"
domains: [privacy, telemetry, network, offline]
---

# 隐私与网络面

### BIZ-privacy-001: 零遥测信任基线

**Rule**: dsh-forge 不内置遥测/埋点/自动上传;对外网络访问仅限用户显式动作(更新检测对 GitHub Releases 的 HTTPS 只读访问)。
**Context**: 社区免签名分发工具的信任基线;同时支撑离线自足(SC2)与无监听端口安全模型。
**Scope**: [CROSS]
**Source**: /learn entry 2026-09-19

- 依据 dsh-forge-m1 PRD(Other Notes · Data/Security Requirements)。
- 后续里程碑(M2+)如需引入任何数据采集,须显式提案推翻本规则,不得默认添加。
