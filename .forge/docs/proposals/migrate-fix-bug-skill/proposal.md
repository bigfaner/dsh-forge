---
title: 老 forge 技能迁移：fix-bug（TDD 修缺陷工作流独立技能化）
status: draft
intent: new-feature
created: 2026-10-09
author: faner
---

# 提案：migrate-fix-bug-skill

## 问题（Problem）

dsh-forge 从老 forge（Z:\project\ai\forge）迁移技能体系时，`commands/fix-bug.md`——一套完整的
TDD 修缺陷工作流（**复现 → 失败测试先行 → 最小修复 → 四门验证 → 原子提交**）——未被迁移。
证据：

- `packages/plugin-forge/skills/`（5 技能）与 `packages/plugin-forge-spec/skills/`（8 技能）均无 fix-bug；
- 新系统任何已迁技能与 core 派发模板中都不存在「失败测试证明 bug 在场之前禁改产品码」的硬门——
  `coding-fix` 模板（`packages/core/src/forge/tasks/prompt/templates/coding.ts` L133-174）只要求最小修复，
  无失败测试先行纪律；
- 本仓近期实际修缺陷走 blitz 提案（如 `.forge/docs/proposals/tool-row-lossless-json-fix/`），
  过程中无 TDD 协议约束——修缺陷工作流存在真实空缺。

紧迫性：修缺陷是日常高频路径；老 fix-bug 的核心价值（先失败测试后修、修+测试原子提交、根因注记）
在新系统零承接。

## 方案（Solution）

在 `packages/plugin-forge/skills/fix-bug/SKILL.md` 新建**独立用户直调技能**（DSH 中 skill 即命令，
`user-invocable` 缺省即人类可调）。工作流六步保留，五处适配新系统：

| 老原文 | 迁移后 |
|---|---|
| Step 1 读 `docs/conventions/`+`docs/business-rules/` frontmatter | `knowledge_search` 优先（域前缀/关键词，主会话在装 knowledge 插件），`docs/conventions/` 兜底 |
| Step 3b 面级测试表 `tests/<journey>/ui.spec.ts` 等五面 | 新约定：`tests/<journey>/`（多面项目 `tests/<surfaceKey>/<journey>/`），面级执行走 `just test journey="<journey>"` |
| Step 5 质量门 | 保持 `just compile→fmt→lint→unit-test`（与新 justfile 及 submit-task 四门逐字一致，天然对齐） |
| Step 6 `Skill(skill="forge:git-commit")` | **内嵌两态 commit 纪律**（AGENTS.md 在场从其约定，缺席回退 Conventional Commits；fix+tests 单原子提交；message 模板 `fix(<scope>): …` + `Root cause:` 一句）。不复活 git-commit（维持 Out of Scope #12） |
| Knowledge Review 整章（forge config CLI + docs/decisions|lessons|conventions|business-rules 四类写入格式） | **适配新知识库**：保留 notable-knowledge 启发式与静默退出；去重改 `knowledge_search`；候选经 ask_user_question 确认后，按 frontmatter 契约（`summary`/`keywords` 必填、域=目录路径 ≤3 层、`title` 缺省文件名）写 markdown 条目到项目知识目录（注册缺省 `<workspace>/.knowledge/`），静默重建自动索引 |

同步更新 `packages/plugin-forge/skills/README.md`：五技能清单 → 六技能（+fix-bug 条目）。

参数解析（`--issue`/`--scope`/`--skip-e2e` 与 argument-hint 语义）保留为散文表述（DSH skill 无
argument-hint 对应物）；`allowed-tools` frontmatter 删除；老文中的 bash 示例（grep -r / git log 等）
改写为工具语义或 just/git 直接命令，不假设 bash（Windows worker 兼容）。

## 备选方案（Alternatives）

1. **本方案（定向迁移 fix-bug）**——深度适配五处张力，交付即用；代价是 clean-code 等其余项继续缺席。
2. **批量迁移有消费者项**（fix-bug + clean-code + code-quality-simplify 悬空引用 + …）——广度优先，
   单项适配深度被摊薄；用户裁决缩小范围，未采纳。
3. **不迁技能，把 TDD 纪律回填 coding-fix 派发模板**——改变全量 fix 任务派发行为，且失去用户直调
   入口（老 fix-bug 本就是独立命令，管线模板是另一薄协议）；用户裁决只迁独立形态，未采纳。
4. **什么都不做**——修缺陷 TDD 纪律继续零承接；零成本但空缺持续。

## 范围（Scope）

**In-scope：**

1. `packages/plugin-forge/skills/fix-bug/SKILL.md` 新建（单文件、一层目录结构，合 dsh-skill-filesystem
   发现约定；frontmatter `name: fix-bug` 与目录一致 + `description`），内容如「方案」节所列六步五适配。
2. `packages/plugin-forge/skills/README.md` 清单更新（+fix-bug）。

**Out-of-scope：**

- clean-code 技能迁移与 `code-quality-simplify` 模板悬空引用修复（模板 L345/363 仍引用不存在的
  `Skill(skill="forge:clean-code")` 且用 drift #8 已废弃前缀形式——**已发现的既有缺陷，记录待另行收口**）；
- coding-fix 模板 TDD 回填（用户裁决：fix-bug 只迁独立调用形态）；
- git-commit / git-checkout 技能复活（维持 Out of Scope #12）；
- test-gen-* 三模板残留 `forge:` 前缀引用（同源 drift，另行收口）；
- learn / consolidate-specs 及其余老技能；知识写入正式工具面（M4 规划，落地后技能文本切换工具调用）。

## 风险（Risks）

| # | 风险 | 缓解 |
|---|---|---|
| 1 | 写侧直写知识目录绕过正式写入面（M4 才有）：条目格式错→不入索引，静默失败 | 技能文本内嵌 parser 契约要点（summary/keywords 必填、域 ≤3 层、title 缺省文件名）；写后可用 `knowledge_search` 自验证可检索；知识目录不在场（或非注册缺省路径）则跳过写侧、静默退出 |
| 2 | commit 纪律两态文本在 submit-task 与 fix-bug 双处出现，未来漂移 | fix-bug 文本显式标注「与 submit-task 同款两态」；技能文本无法跨文件引用，接受有限重复，README 记 drift 风险 |
| 3 | 老文 bash 示例在 Windows worker 不可执行 | 示例改 just/git 直接命令与工具语义（grep/glob 工具），禁 bash-only 语法（find 管道等） |
| 4 | 知识目录路径依赖注册缺省约定（`<ws>/.knowledge/`），注册时可为自定义路径 | 技能表述为「项目注册的知识目录（缺省 `<workspace>/.knowledge/`）」+ 目录不在场即降级跳过（风险 1 缓解同路） |

## 验收标准（Success Criteria）

1. `packages/plugin-forge/skills/fix-bug/SKILL.md` 在场：一层目录、单文件；frontmatter
   `name: fix-bug`（kebab、与目录名一致）+ 非空 `description`；`user-invocable` 缺省（= 人类可调）。
2. 技能文本含四条硬语义：①复现失败即停（不写测试不修码）；②失败测试先行禁令（产品码改动前测试必须
   因 bug 而败）；③质量门序列 `just compile→fmt→lint→unit-test`；④原子提交（fix+tests 同提交）+
   两态 commit 纪律 + `Root cause:` 注记。
3. 文本零引用已删/旧机制：`forge config` CLI、`Skill(skill="forge:")` 前缀调用、git-commit 技能、
   docs/decisions|lessons|business-rules 写入格式、learn/consolidate-specs、老五面测试表
   （`tests/<journey>/ui.spec.ts` 字样）。
4. 知识面双向在场：Step 1 `knowledge_search` 查询；知识评审节含启发式表 + `knowledge_search` 去重 +
   ask_user_question 确认 + 条目契约（summary/keywords/域 ≤3 层）+ 静默退出路径。
5. `packages/plugin-forge/skills/README.md` 六技能清单与目录一致（fix-bug 条目摘要准确）。
6. 仓级检查绿：`pnpm lint` + `pnpm test`（markdown-only 变更，预期零影响；跑通为准）。

**一致性检查**：SC1↔条目1；SC2/3/4↔条目1（内容三面）；SC5↔条目2；SC6↔全范围回归。每个 in-scope
条目均喂给至少一条 SC（条目1→SC1-4，条目2→SC5），无互相矛盾（SC3 的禁引清单与 out-of-scope 一致）。
检查通过，2026-10-09。
