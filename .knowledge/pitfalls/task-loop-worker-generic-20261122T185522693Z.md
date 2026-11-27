---
title: task-loop worker 两工具瘫痪：generic 兜底档宽度假设与专家缺席宿主
summary: >-
  task-loop worker 只有 submit_task+todo_write 两工具：generic
  兜底档原宽度建立在「专家路由恒在场」假设上，专家缺席宿主下 keep-only 滤除全部执行族；0.20.0 起并入执行基础集修复。排查走容器事件日志
  toolFilter + 安装代 dist。
keywords:
  - task-loop
  - worker
  - toolFilter
  - generic兜底档
  - 专家路由
  - keep-only
  - 工具面瘫痪
  - dispatch
id: task-loop-worker-generic
status: confirmed
version_ts: '2026-11-22T18:55:22.693Z'
updated: '2026-11-22T18:55:22.693Z'
type: pitfalls
candidate_of: forge-pluginization-three-domain-map
confirmed_at: '2026-11-23T16:18:00.846Z'
---
## 症状

task-loop 派发的 worker 结算 blocked，自述「只有 submit_task 与 todo_write 两个工具，无文件/shell 能力」；事件日志 logs/{slug}.jsonl 的 task-spawned.toolFilter（deny 面）正常——瘫痪在 allow 面。

## 根因链

1. generic 兜底档原设计 allow = 管线必备两员（WORKER_PIPELINE_ESSENTIAL_TOOLS），建立在「专家路由恒在场」假设上——专家缺席宿主（experts 服务未装载/映射键未命中档案）下 keep-only 把 fs/shell 全滤除，worker 结构性瘫痪（todo_write 建单后零执行能力，只能如实 blocked）。
2. 专家缺席的常见形态：分家后档案无扫描层承载；experts 服务 cwd 锚在桌面宿主解析失效（另见 experts-cwd-anchor 条目）。

## 排查路径（实证序）

1. 容器事件日志：`harness/forge/projects/<proj>/logs/{slug}.jsonl`——task-spawned 的 toolFilter 即 deny 面；worker 自述工具数才是 allow 面事实。
2. 安装代 dist 定位（不猜源码）：live 世代 `node_modules/@dsh-forge/task-loop/dist/host/index.js` grep `WORKER_PIPELINE_ESSENTIAL_TOOLS`——源码 worktree 可能比安装代新。
3. delegate_expert(key) 探测 experts 服务可见性：not found = 注册表未见该键；其它报错 = 委派链另有缺陷（隔离变量）。

## 修复事实（2026-11-23）

task-loop 0.20.0 起 generic 档 allow 并入 WORKER_GENERIC_EXECUTION_TOOLS（fs 五员 + shell 双候选，矩阵对全四类任务族恒放行）；expert 档不并入。原则：兜底档宽度不得建立在「上游服务恒在场」假设上。

## 来源

容器 expert-builtin-redistribution / t-ac2 四轮阻塞定谳；修复提交 5af665f9。
