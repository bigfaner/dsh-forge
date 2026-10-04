---
id: "fix-26"
title: "Fix: DSH_HOME 缺省改隔离（{userData}/dsh-home）+ credentials-local 官方 path 缝桥接真 home 凭据——数据两界（账本/会话/注册表/设置/skills），凭据共享不重配（fix-18 全共享副作用收口）"
priority: "P1"
estimated_time: "4h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: dsh home 数据隔离 + 凭据桥（方案 A）

> 来源：走查人（2026-10-04）「探索：能不能基于 dsh home 隔离数据？」——探索报告三案裁决取 A（数据隔离+凭据桥）。背景：fix-18 翻案 S1 隔离 pin 后真 home 全共享，副作用 = 原生 dsh 工作区/会话混入产品账本（fix-24 选择器污染的根源）。

## 探索结论（官方缝实证，全部只读源码）

- **DSH_HOME 单根**（[@deepseek-ai/dsh-home-paths](../../../apps/host/profile.dev/node_modules/@deepseek-ai/dsh-home-paths/lib/index.js) `resolveDshHome`）：configured > `$DSH_HOME` > `~/.dsh`，整体重定向无子目录混搭；
- **跟 home 走的数据**：sessions（dsh-base patch :133 `root: dshHomePath('sessions')`）、**storages 含 workspace 注册表**（:168-171 + 注释「workspace in web layers routes through this stack」）、settings、skills、`.env`；
- **凭据唯一例外——官方配置缝**（[@deepseek-ai/dsh-credentials-local](../../../apps/host/profile.dev/node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js) `resolveSpec` :56-62 + Config schema :393-398）：`config.path` 显式优先于 home 拼接——凭据文档可留真 home 而数据走隔离根，**官方支持组合非 hack**；absent 文件 = 空存储不炸（loadInitial ENOENT 路径 :647-655）。

## Description

1. **缺省翻隔离**（[apps/host/src/profile/paths.ts](../../../apps/host/src/profile/paths.ts) `resolveDshHome` :94-102）：三层改两层——`DSH_FORGE_DSH_HOME` 显式 > 缺省 `{userData}/dsh-home`（原 USER_DATA 分支值升为缺省；e2e 形态值不变零改动；fix-18 注释与 paths.test.ts 随改）；
2. **凭据桥**（[apps/host/src/boot/overlay.ts](../../../apps/host/src/boot/overlay.ts)——dbFile/bindingsFile 动态注入同机制）：boot overlay 给 credentials 行（dsh-base roster id `credentials`）注 `config.path = join(homedir(), '.dsh', '.credentials.yaml')`：
   - 生效门：**非 USER_DATA 隔离态**（e2e/测试不读真凭据——与 fix-18 隐式隔离门同构）；
   - 真 home 凭据不存在 → path 指向 absent = 空存储，Models 页首写即在真 home 创建（单一真相源，原生 dsh 同步可见/可改）；
   - `.env` fallback 随隔离（user-env 层两界；继承进程 env 仍最高优先——`DEEPSEEK_API_KEY=…` 场景不受影响）；
3. **首启迁移语义（P1 最简口径）**：隔离账本从零——已注册项目的 workspaceId 绑定失效 → **重注册同目录** = 隔离账本新建 workspace 记录 + forge 重绑（ownership「挂接既有」机制；`.forge`/`.knowledge` 内容无损）。不做自动迁移；首启检测（state.db 有项目 + dsh-home 新建）→ 引导提示重注册一句文案（可选，不强）；
4. **fix-24 关系**：隔离后选择器天然干净——fix-24 降级为**防御性过滤**（保留 pending；防未来共享形态回摆，owner 可裁决撤销）；
5. skills/settings 隔离为接受面（产品 skills 空、设置独立）；官方多根 skills 支持另探（不在本任务）。

## 验收

1. 人用形态（无 USER_DATA env）：`{userData}/dsh-home/{sessions,storages}` 生成且增长；真 home `~/.dsh/storages`、`~/.dsh/sessions` **mtime 不动**（隔离实证）；
2. 原生 dsh 用过的工作区不出现在产品选择器/侧栏（账本两界）；产品新建会话不进原生 dsh 时间线；
3. 发消息直接用真凭据（不弹配置）；产品 Models 页改 key → 真 home `.credentials.yaml` 更新（原生 dsh 同步读到）；
4. e2e（USER_DATA 在场）：不桥、全套零改动通过；单测：resolveDshHome 两层 + 桥生效门 + overlay 注入形状；
5. 重注册同目录：挂接既有，知识/轨迹内容无损。

## Reference Files

- 官方（只读）：dsh-home-paths lib/index.js（单根解析）；dsh-credentials-local lib/index.js:56-62（path 缝）/:393-398（Config）/:647-655（absent=空）；dsh-base cordis.patch.yml:117-118（credentials 行）/:133（sessions）/:168-171（storages/注册表）
- 产品：apps/host/src/profile/paths.ts:89-102（三态→两层）、apps/host/src/boot/overlay.ts（动态 config 注入机制）、apps/host/src/main.ts:37（DSH_HOME 重定向点）
- 关联：fix-18（全共享翻案——本任务收口其副作用，凭据共享语义经官方缝保留）、fix-24（降级为防御性过滤）

## 边界与不做

- 不动 dsh 侧任何源码（全经产品装配面：env + overlay config）；
- 不做存量数据自动迁移（重注册挂接既有即可，记录口径）；
- skills 多根/共享官方支持另探（后续独立任务）；
- 不隔离 cache/（随 home 走，无业务语义）。
