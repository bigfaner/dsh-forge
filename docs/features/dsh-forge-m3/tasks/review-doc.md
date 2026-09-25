---
id: "T-review-doc"
title: "Review Documentation Quality"
priority: "P1"
estimated_time: "30min"
dependencies: ["5.6", "0.4", "0.3", "0.2", "0.1"]
type: "doc.review"
surface-key: ""
surface-type: ""
---

Review documentation quality for the dsh-forge-m3 feature (breakdown mode).

## Acceptance Criteria Summary

The following acceptance criteria are pre-extracted from doc tasks. Use these as the review baseline.

### 0.1-spike-tool-registration

- [ ] spike-1-tool-registration.md 给出 tool 注册契约定形:扁平名规则、输入 schema 形态、handler 注册面,每项引用具体 vendored 源码路径/符号。
- [ ] 桥链路可用性矩阵:host → cordis rpc → client tool 桥 → IPC 白名单逐跳给出可用/不可用判定与依据;不可行时给出兜底通道建议。
- [ ] 时延与启动竞态:给出桥首调时延实测(量级即可)与竞态窗口判定(UI 未装载时调用行为),确认「重试一次 + 明确提示」降级链是否充分,不足则给兜底建议。
- [ ] tech-design §Open Questions spike ① 回填完成,无「待定」项。


### 0.2-spike-subagent-approval

- [ ] 审批事件订阅/应答通道定形:候选通道逐一判定(可用/不可用 + 依据),明确 approval-bridge 采用的订阅面与应答面。
- [ ] FORGE_ACTOR 透传结论:subagent 上下文中 actor 标识的携带形态定形(dispatch 行 + task 变更记 actor 的落点),不可行处给推断兜底。
- [ ] 审批请求 payload 的可观察性结论:类别/正文可否结构化送达内核(approval_request.payload_json)。
- [ ] tech-design §Open Questions spike ② 回填完成,无「待定」项。


### 0.3-spike-systemprompt-contract

- [ ] 四候选逐一给出证实/证伪结论与依据(具体接口面/源码符号),不凭文档记忆。
- [ ] 最终裁决明确:采用哪一候选注入预合成内容;若为 ④,给出追加形态与 M2 基线的差异说明。
- [ ] prompt_hash 口径定形:hash 对象(systemPrompt 或组合首条消息)与逐字符比对形态,兼容 M2 e2e channel stub journal 复用。
- [ ] tech-design §Open Questions spike ③ 回填完成,无「待定」项。


### 0.4-spike-prompt-templates-port

- [ ] 任务类型协议清单完备:forge prompt 支持的每一任务类型(含 doc 族)的协议文本均有出处(Go 模板文件路径)与移植结论。
- [ ] 预合成模板映射表:三要素(协议/目标摘要/生效偏好)各自的模板来源与组装位点明确,与 Interface 3 预合成定义一致。
- [ ] 暂缓迁移技能(20 项)与被取代 2 项(execute-task/run-tasks)的协议依赖逐一标注去向(移植/暂缺/被预合成吸收)。
- [ ] tech-design §Open Questions spike ④ 回填完成,无「待定」项。


### 5.6-skills-bundle

- [ ] 15 项技能全部落 `resources/skills/` 扁平名目录,格式符合 skill-filesystem 消费形态(frontmatter/结构以 vendored 源码为准)。
- [ ] 迁移清单完备:15 项逐项源→目标对照 + 适配点说明;20 项暂缓 + 2 项取代处置对照明确(计数 = 37 与 PRD 一致)。
- [ ] 协议类内容(任务类型协议/执行协议引用)与 spike④ 移植面口径一致,无凭记忆改写。
- [ ] 技能内容双语文案与引用路径在 dsh 形态下自洽(无 `forge:` 前缀遗留、无失效相对路径)。


## Discovery Strategy

Scan ONLY the following allowlist of directories for target documents:
- docs/features/dsh-forge-m3/ (prd/, design/, testing/, and any subdirectories)
- docs/proposals/dsh-forge-m3/

EXCLUDE the following from scanning — do NOT read or process these:
- tasks/ directory (task definitions are not deliverables)
- tasks/records/ directory (execution records are not deliverables)
- manifest.md (build artifact)
- index.json (build artifact)

Only .md files under the allowlist directories are target deliverables.

## Acceptance Criteria

- [ ] All acceptance criteria met
