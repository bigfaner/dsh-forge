---
id: "fix-39"
title: "Fix: 注册链目录自愈——知识/forge 目录（及工作区目录）不存在时注册自动创建，消除 ERR_INVALID_KNOWLEDGE_DIR / ERR_WORKSPACE_CREATE 面的用户可避错误"
priority: "P1"
estimated_time: "3h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: 添加项目时目录不存在 → 自动创建（用户验收 2026-10-05 报障①）

## 症状（用户原话）

「添加项目时，若目录不存在自动创建知识目录等，避免报错。」

## 根因（本会话勘察结论，源码核实）

1. **表单零存在性校验**：`apps/web/src/flows/add-project/form-model.ts` `validateFormValues` 只查空串 + 绝对路径形态（AC5），`knowledgeDir`/`forgeDir` 可直输任意不存在路径（默认值 `<ws>\.knowledge` 在新工作区普遍不存在）——不存在不拦截、不创建。
2. **注册链零目录落盘**：`packages/core/src/forge/project-service.ts` `registerProject` 四步链（归一 → 自愈预检 → ① 预检 → ② registry.create → ③ 写行）**全程不建任何目录**；`canonicalizeDir`（fail-soft realpath）对缺失目录原样透传。
3. **官方 registry.create 硬门**：`ctx.workspaceRegistry.create(path)` canonicalize 要求**目录必须已存在且为目录**（G1 pin ④，tests/contract/pin-04-workspace-registry.test.ts:5）——工作区目录缺失 → `WorkspaceCreateError`（ERR_WORKSPACE_CREATE，六码）。
4. **迟到爆炸面**：knowledge 目录缺失时注册**成功**，错误迟到一步：`scanKnowledgeDir`（packages/core/src/knowledge/scan.ts:44-54）→ `InvalidKnowledgeDirError`（ERR_INVALID_KNOWLEDGE_DIR「知识目录不可达或非法」）→ 知识视图 empty-state 面（apps/web/src/rpc/ui-state.ts:21）+ 检索面（shared.ts 降级原样上抛）。用户感知为「添加项目就报错」。

## 修复方案

### A. 注册链自愈（core，主修复）

`registerProject`（project-service.ts）在 ② registry.create **之前**插入「目录确保」步（新 helper，`mkdirSync(dir, { recursive: true })` fail-soft 包装）：

- `knowledgeDir` / `forgeDir`：**无条件确保存在**（缺则建，幂等；建失败 → 沿现行 typed error 面上抛，建议归入 ERR_PROJECT_WRITE 前置或独立错误码——执行时按六码表现状裁决，六码扩码须 contracts/web/host 三处一体）；
- `workspaceDir`：同样确保（对账「选定后目录被删」竞态；表单 workspaceDir 来自选取器，误拼面低）。注意：必须在 ② 之前——官方 create 的 realpath 门要求目录在场；**创建后 canonicalizeDir 语义不变**（新建目录 realpath = resolve 态，落库口径零变化）。
- 自愈径（attachExistingRow 命中/挂接既有）**不建目录**——挂接语义零副作用不变。

### B. 存量行自愈（knowledge 面）

`rebuildIndex`（index-service.ts）扫描前置门：`knowledge_dir` 缺失 → **mkdir 确保后继续**（只对 ENOENT 缺失态；路径为普通文件/权限不可达仍走现行 `InvalidKnowledgeDirError`）。理由：fix-39 前注册的行（如 Z:\learn 无 .knowledge）不经重注册即愈，免迁移脚本。六码语义收窄为「路径存在但非法/不可达」。

### C. 表单提示（web，轻量）

RegisterForm 知识库/文档位置字段失焦校验静默放行不存在路径（不报错——A 会建）；可在派生行 hint 提示「目录不存在时将自动创建」（文案进组件常量，zh/en 双语对齐现行 locale 面——仅产品自绘文案，不进官方词典）。

## 验收

1. 全新空目录（无 .knowledge/.forge）注册 → 成功且两目录已在盘上落位；知识视图即扫即用（空索引不报错）；
2. 直输不存在的知识/forge 路径（多级缺失 `D:\a\b\c\.knowledge`）→ 注册成功，目录递归创建；
3. 存量行（knowledge_dir 缺失）触发知识视图 → 自动重建目录，不再出现 ERR_INVALID_KNOWLEDGE_DIR empty-state；knowledge_dir 指向**普通文件** → 仍报现行错误（语义收窄验证）；
4. workspaceDir 选定后被删再注册 → 注册成功（目录自愈）而非 ERR_WORKSPACE_CREATE；
5. 单测：project-service（新建/挂接两径目录副作用断言——挂接径零 mkdir）、index-service（缺失自愈/文件仍抛）、scan.ts 契约收窄；e2e：project-registration 增「无 .knowledge 注册即用例」。

## Reference Files

- packages/core/src/forge/project-service.ts（:171-224 注册主链——插入点；:86 canonicalizeDir fail-soft）
- packages/core/src/knowledge/{scan.ts:44-54, index-service.ts:61-67, shared.ts:70-78, errors.ts:13-23}
- apps/web/src/flows/add-project/{form-model.ts:157-179（校验零存在性面）, RegisterForm.tsx（hint 落位）}
- tests/contract/pin-04-workspace-registry.test.ts:5（官方 create「须存在且为目录」pin——A 步时序依据）
- apps/web/src/rpc/ui-state.ts:21（ERR_INVALID_KNOWLEDGE_DIR → empty-state 现行映射）
- 关联：fix-27/fix-30（注册链自愈/归一——本任务不改其语义，目录确保是纯增量前置步）

## 边界与不做

- 不动官方 registry.create 语义（pin 面）；目录确保是产品侧前置步；
- 不做「注册时预扫知识文件」（索引构建仍惰性——现行语义）；
- 挂接既有/幂等重注册径零盘副作用（Hard Rule：幂等语义不破）；
- 不回收 ERR_INVALID_KNOWLEDGE_DIR 错误码（语义收窄为真非法，六码面稳定）。
