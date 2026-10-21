---
feature: "app-observability"
journey: "log-retention-lifecycle"
risk_level: "High"
surface_types: ["web"]
surface_keys: ["host"]
sources:
  - .forge/docs/proposals/app-observability/proposal.md
  - .forge/docs/proposals/app-observability/review/report.md
generated: "2026-10-19"
---

# Journey: log-retention-lifecycle

**Risk Level**: High

## Overview

留存策略生命周期实测：按天滚动（UTC 日界）→ 第 8 天自动清理 → 注入超 50MB 内容触发单文件截断 → Windows 句柄占用致截断/清理失败时降级为跳过本轮 + 下一轮重试成功、不阻塞应用（方案 5 ↔ 验收 3）。取证纪律：滚动/清理/截断必须在真实文件系统与应用运行态下发生（真实 fs 句柄、真实时间或受控时钟推进），**不可 fake**——不得以内存表或 mock fs 断言替代落盘验证。

## Setup

- 应用正常运行，`data/logs/` 就绪；测试前记录目录内文件清单与大小基线
- 时间操纵手段已备（受控时钟推进或系统时间窗），用于日切与第 8 天边界；时钟口径 = UTC 日界（与 timestamp 字段同口径）
- 可注入大体积日志内容的注错入口已装配（累计 >50MB）
- Windows 生境（句柄占用场景的目标平台）+ 一个可长期占用文件句柄的外部进程（如打开文件流的探针进程）

## Happy Path

### Step 1: 触发跨日滚动

**User Action**: 推进时钟跨越 UTC 日界（或自然跨日）后触发一次日志写入

**Expected Result**: 新增 `app-YYYYMMDD.jsonl`（按新日期命名）；旧日期文件保留不再追加；两文件均逐行 JSONL 可解析；写入行为对应用零感知（无卡顿/无错误呈现）

### Step 2: 触发 50MB 截断

**User Action**: 经注错入口向当日文件累计注入超过 50MB 的日志内容

**Expected Result**: 截断生效——当日文件被截回上界以内（或按定版截断语义重建），截断事实落一行诊断记录（计数/事件行）；截断前后应用业务路径不受阻（写盘 fire-and-forget）

### Step 3: 第 8 天自动清理

**User Action**: 时钟推进至第 8 天（最早一份日志跨过 7 天保留窗）后触发下一轮滚动/写入

**Expected Result**: 最旧日期的 `app-*.jsonl` 被自动删除；保留窗内的 7 份文件全部健在；清理动作不删除当日文件

### Step 4: 句柄占用致失败 → 降级重试

**User Action**: 外部探针进程长期占用当日（或待清理）文件句柄，再触发截断/清理轮；随后释放句柄触发下一轮

**Expected Result**: 占用期间该轮截断/清理失败 → **跳过本轮、落降级诊断记录、应用不阻塞**（业务照常、日志写入降级路径不反压）；句柄释放后下一轮重试**成功**（截断/清理补齐完成）

## Edge Cases

### Step 1b: 日切前最后一行与日切后第一行归属

**Precondition**: 写入恰好横跨 UTC 日界

**User Action**: 在日界前后各注入一行（timestamp 可辨识）

**Expected Result**: 行归属以各自 timestamp 的 UTC 日为准分别落入新旧文件；无跨文件串行、无丢行

### Step 2b: 注入速度超写盘能力（待写队列上界）

**Precondition**: 大体积注入叠加 fs 线程池延迟

**User Action**: 高速灌入日志内容超过 main 侧待写队列上界

**Expected Result**: 超界行丢弃 + 计数落盘（防无界积压红线）；业务路径（prompt/发送）不受阻照常完成；进程内存不因队列无界增长

### Step 3b: 清理期间目录句柄占用

**Precondition**: 探针占用**目录**而非文件（Windows 目录句柄场景）

**User Action**: 触发清理轮

**Expected Result**: 同降级语义——跳过本轮 + 记录 + 不阻塞；释放后重试成功

### Step 4b: 降级轮不丢当轮业务日志以外的证据

**Precondition**: 句柄占用期间正常产生业务诊断行

**User Action**: 占用窗口内注错 + 观察重试成功后的文件内容

**Expected Result**: 截断/清理本身跳过，但滚动写入的新行不被永久丢弃（新行落在仍可写的目标上或重试后补齐）；「跳过本轮」语义不放大为「停止日志链」

### Step 4c: 连续多轮占用后的恢复

**Precondition**: 连续多轮句柄占用（降级连续发生）

**User Action**: 连续触发多轮失败后释放并重试

**Expected Result**: 每轮失败均落降级记录（可数）；恢复轮一次成功；应用全程不崩溃、不阻塞、无用户可见错误

## Journey Invariants

- 留存策略三参数恒定：按天分文件（UTC 日界 = timestamp 同口径）、保留 7 天、单文件 50MB 截断
- 句柄占用类失败的唯一语义 = 跳过本轮 + 下一轮重试，不阻塞应用、不反压业务（fail-soft 降级，缺口⑤「静默放行」的反面——降级必留计数记录）
- appender 写盘 fire-and-forget；留存策略任何失败不改变业务路径行为
- main 唯一写者——清理/截断/滚动全部由 appender 单点执行，无第二写者竞争
- 所有截断/清理/降级动作自身落诊断记录，可事后审计
