---
created: "2026-10-13"
author: "faner"
status: "Draft"
intent: "enhancement"
---

# Proposal: 任务实体规格完备化——改动范围/参考文档/时间预算/vars 单源（task-entity-completeness）

> **定位**：任务域实体与派发简报的规格完备化（enhancement）。诱因：worker-exec-evidence-replay
> 挂任务时暴露"新任务缺改动范围/参考文档"，追查发现非个案——M3 实体砍除老 forge 显式字段后
> 六项缺陷散落无人认领。用户裁决：不修修补补，全面梳理补齐。

## Problem

任务实体（tasks 表 + AddTaskInput + dispatchPrompt 简报）相对老 forge 形态有六项规格缺陷：
worker 领取任务时拿不到"改哪里、参考什么、预算多少"的结构化指引，全靠 desc 自由文本
自觉——挂任务者漏写即断供，无机械防线。

### Evidence（逐项）

- **D1 改动范围无字段**：tasks 列集（migrations.ts）有 surface_key/surface_type 无预计文件；
  compose.ts 简报无对应行；fix 链 SOURCE_FILES 经 vars 字符串临时承载（run-tasks 技能契约）。
- **D2 参考文档无创建侧入口**：refs 为读面派生（detail.ts DOC_ANCHOR_RE 从 task_desc/vars
  抓路径 token——未声明即不可见）；AddTaskInput 无 refs 参数。
- **D3 时间预算有列不达**：estimated_time 有 DB 列，DispatchPromptInput 无该键——简报不渲染。
- **D4 task_desc 一字段三义**：GOAL 正文（compose 逐字）+ 参考锚点来源（detail 正则提取）
  + 改动点说明（惯例）糊于同一自由文本。
- **D5 vars 无标准键单源**：SPEC/SOURCE_FILES/TEST_SCRIPT/TEST_RESULTS/SKIP_EVAL_GATE
  等契约键散落各技能正文与 compose 注释，拼写漂移无机械拦截。
- **D6 FILE 行残废**：task_file 列 M3 砍除，FILE 行靠调用方按需注入——db-only 任务
  （addTask/quick-tasks 建，当前主要形态）永缺定义载体引用。

已修复不重复立项：SURFACE 透传缺口（S2b 已落——claim.ts 注入 surfaceKey/Type + 简报行）。

## Solution

实体补齐四项结构化承载 + 一个单源约定，全部进派发简报：

1. **改动范围一等公民**：tasks 增预计改动文件列（结构化 JSON，files_json 同形制纪律），
   AddTaskInput 增对应参数，简报增 PLANNED_FILES 行；fix 链 SOURCE_FILES 收编为同键。
2. **参考文档创建侧入口**：tasks 增参考文档列（rel_path 正斜杠 + 悬空容忍——detail 读面
   从正则派生改为列驱动，派生逻辑保留为兜底）；AddTaskInput 增参数，简报增 REFS 行。
3. **时间预算进简报**：estimated_time 列接 DispatchPromptInput，简报增 ESTIMATE 行。
4. **vars 标准键单源**：contracts 建标准键常量（SPEC/SOURCE_FILES/TEST_SCRIPT/
   TEST_RESULTS/SKIP_EVAL_GATE 等），技能契约与 addTask 面对齐引用，拼写漂移 = 编译红。

D4/D6 不新增字段：task_desc 保持 GOAL 唯一语义（改动范围/参考文档迁移到新字段后自然
卸载）；FILE 行维持"调用方注入"形态（db-only 任务由新字段承载规格语境）。

## Alternatives

- **方案 A（选定）**：实体加两列 + 简报三行 + vars 单源——结构化、有机械防线。
- **方案 B**：不动物体，约束块写"挂任务必填 desc 段"惯例——靠自觉，正是现状病灶。不选。
- **方案 C**：恢复老 forge task_file + 模板文件制——与 db-only 主形态相悖（M3 裁决砍除
  有因：任务定义唯一到达面 = 简报）。不选。
- **方案 D（什么都不做）**：缺陷延续，每次挂任务靠人记得补 desc——本次六任务已现形。不选。

## Scope

**收编**：D1（预计文件列 + 简报行 + fix 链收编）、D2（参考文档列 + 简报行 + 读面列驱动）、
D3（ESTIMATE 行）、D5（vars 标准键单源常量）。

**出界**：D4/D6 结构性新增（按 Solution 以字段迁移消化）；老 forge 21 模板复辟（persona
已承载）；GUI 面板呈现调整（读面 DTO 增字段后前端随行，不单列）；schema 版本线变更
（v1 直改纪律不变——零兼容义务，存量开发库废弃重扫照旧）。

## Risks

1. **schema v1 直改再扫**：存量开发库废弃重扫（worker-exec-evidence-replay 等活跃容器
   任务状态丢失）——缓解：挂任务前先跑完/结算活跃容器；重扫操作流程已有先例
   （pre-s3-backup 脚本形制）。
2. **两列 JSON 形制漂移**：planned_files/refs 与 files_json 形制不一致——缓解：tech-design
   逐字 pin schema.sql ↔ migrations，列注释写明形制纪律（TECH-task-004 同源）。
3. **标准键收编期双轨**：技能正文旧字符串键与新常量并存——缓解：收编任务一次清完
   （grep 六键全量对齐），不留过渡态。
4. **简报膨胀**：+3 行挤压 worker 提示词预算——缓解：缺席省行纪律不变（compose 键级
   零标签传统），典型增量 <3 行。

## Success Criteria

1. AddTask 支持 plannedFiles/refs 参数；缺省任务三键简报行省行（缺席纪律）。
2. 简报含 PLANNED_FILES/REFS/ESTIMATE 三行（字段在场时），worker 领取即可见改动范围/
   参考文档/预算。
3. detail 读面 refs 列驱动（声明即链），正则派生降为兜底且行为不回退。
4. fix 链 SOURCE_FILES 经标准键常量承载（六键 grep 对齐，技能正文零散字符串清零）。
5. schema.sql ↔ migrations pin 同步；全仓 compile/lint/test 三门绿 + 新增单测覆盖
   （简报渲染/读面列驱动/常量对齐）。

### Consistency Check

- SC1←D1/D2 创建面；SC2←D1/D2/D3 简报面；SC3←D2 读面；SC4←D1 收编+D5 单源；
  SC5←全部的机械门。每条 SC 有收编项承载，无矛盾。**检查通过（2026-10-13）**。
