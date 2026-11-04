---
title: 裸 catch 豁免判据五族分类
summary: >-
  全仓 `} catch {` 裸吞审计的豁免判据五族——注释化 fail-soft
  缺席语义、诊断面红线不反压、错误显式回传、官方面防御读取、测试夹具；五族之外一律补点。另注意字符串内嵌脚本里的 catch 非 TS
  吞没面、登记时点采样数与 HEAD 数漂移需对账说明。
keywords:
  - 裸 catch
  - 吞没审计
  - fail-soft
  - 豁免判据
  - 台账
domainPath: .knowledge/conventions/
来源容器: diag-milestone-coverage
来源任务: 1.6 全量吞没审计（audit.md，364 处全豁免收口）
bug id: 无
id: bare-catch-exemption-five-families
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
related_doc: docs/conventions/diagnostic-emit-discipline.md
---

# 裸 catch 豁免判据五族分类

逐点核对裸 catch 时的五族豁免判据（缺注释化理由且不属于五族 → 补点）：

1. **注释化 fail-soft 缺席语义**：目录/文件/可选服务缺席 = 回落值承接（空集/undefined/false/默认值），行为零影响——占绝大多数。
2. **诊断面红线①不反压**：emit/append/relay/转发链自身 catch（发射失败 → console 兜底或计数器），诊断不静默、业务零反压。
3. **错误显式回传**：typed error / result envelope / `ok:false` / skipped 计数 / 回滚回显——非静默。
4. **客户端官方面防御读取**：`reflect.get` / 快照窄读 / DOM 判定，面漂移 = undefined 降级（宁可功能失灵不可炸壳）。
5. **测试夹具与构建配置**：`*.test.ts`、构建脚本。

## 对账与陷阱

- **计数漂移须说明净差**：登记时点采样数 ≠ HEAD 数是常态（后续迭代新增 fail-soft 面 = 增量；补点任务把裸 catch 改写为 `catch (cause)` + 发射后不再构成裸吞 = 减量），台账中写明净差构成。
- **字符串内嵌脚本中的 catch 不计入**：TS 源码内嵌 PowerShell/shell 脚本字符串里的 `} catch {` 是子进程侧兜底，非 TS 吞没面。
- 原则：审计口径是二分（豁免/补点），不留「未决」态——每行带注释化理由落台账。

- 依据：`.forge/docs/proposals/diag-milestone-coverage/audit.md`（全仓 364 处逐点台账，五族全豁免）。
