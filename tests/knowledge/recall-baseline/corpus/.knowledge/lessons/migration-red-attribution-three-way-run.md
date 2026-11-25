---
title: 迁移红例归因三方对账：基线副本 + 隔离 run + 冷启点口径
summary: >-
  形态迁移类任务的红例归因配方——原始形态临时副本基线同跑对出「存量红」，--grep 隔离 run 分离「序列耦合」，launch
  层同签名一次性红归「基建抖动」；墙钟批时受红例快速失败/超时路径扰动，收益对账以冷启点口径为准。
keywords:
  - 归因
  - 基线对照
  - 隔离run
  - e2e迁移
  - 计时对账
domainPath: .knowledge/lessons/
来源容器: e2e-fast-shared-launch
来源任务: first-pass 知识沉淀（1.13）；audit-xsq-batch.md 各批真机对账
bug id: 无
id: migration-red-attribution-three-way-run
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# 迁移红例归因三方对账：基线副本 + 隔离 run + 冷启点口径

## 配方

形态迁移（per-test → 共享 launch 等）后逐红例三问：

1. **原始形态基线对照**：迁移前对同 spec 跑原始形态临时副本基线；同断言同红 = 存量红（产品侧漂移），按 Hard Rules 归因上报、不迁移面修——这是零回归结论的主证据。
2. **隔离 run**：迁移形态下 `--grep` 单用例 run；隔离绿而批内红 = 序列耦合（见轮转单发红条目），批内恒红且隔离也红才疑迁移固有回归。
3. **基建抖动签名**：launch 层一次性 TypeError / firstWindow closed / 工件 ENOENT，且隔离 rerun 绿 = 基建抖动，非迁移回归。

**计时对账口径**：红例的快速失败与长超时路径使墙钟批时不可比（基线 13 红快速失败 3.2m vs 迁移全绿更慢的情形并存）——形态收益以**冷启点削减数**为主口径，墙钟作参考并在红例收缩后统一收口重跑。

## 附带坑：落盘判读适配

迁移后共享形态会话 cwd = 共享 wsDir 本体，原始命名段不复存在——盘面判读（扫 dsh-home / 共享 userData 根）须：锚 wsDir 末段（mkdtemp 随机后缀天然跨 worker 唯一）、**大小写两侧同归一**（mkdtemp 后缀随机大小写）、**惰性求值**（用例开头会话未开户时根尚不存在）、片段不含斜杠（扁平化目录名，全路径片段必 miss）。

## 依据

全量收口：23 红逐例与各批基线归因对账，零新增红零迁移耦合；uf3 判读两处适配缺陷（早求值 + 沿用原始段）修正后收敛。见 `.forge/docs/proposals/e2e-fast-shared-launch/audit-xsq-batch.md`。
