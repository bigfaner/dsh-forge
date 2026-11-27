---
title: PowerShell 文本重写损坏中文源码：禁令适用面从 package.json 扩至一切非 ASCII 文件
summary: >-
  PowerShell Get-Content/Set-Content 管道重写含中文的 UTF-8 源码 = 整文件 mojibake（GBK
  误读）；AGENTS 对 package.json 的禁令适用面实为一切非 ASCII 文件——文本改动一律走 edit/write 工具。
keywords:
  - powershell
  - set-content
  - 编码损坏
  - utf8
  - gbk
  - mojibake
  - 多字节截断
  - 源码重写
id: powershell-package-json-ascii
status: confirmed
version_ts: '2026-11-22T18:55:43.453Z'
updated: '2026-11-22T18:55:43.453Z'
type: pitfalls
candidate_of: committed-json-artifacts-byte-verified-no-bom
confirmed_at: '2026-11-23T16:18:02.219Z'
---
## 症状

用 PowerShell Get-Content/Set-Content 管道重写含中文注释的 UTF-8 源码文件后，文件内全部中文变 mojibake（GBK 误读后以 utf8 写回，整文件非 ASCII 损坏）。

## 判例

2026-11-23 expert-builtin-redistribution 收口：对 vitest 测试文件做批量字符串替换用 `(Get-Content -Raw) -replace | Set-Content`，文件所有中文注释损坏，只能 git checkout 恢复后用 edit 工具重做。AGENTS §5.2 对 package.json 已有明文禁令（判例家族 eaea8cea，六度复发）——本判例把适用面扩到**一切含非 ASCII 内容的源码/文档文件**。

## 规避

- 任何文本改动一律走 edit/write 工具（字面替换、UTF-8 无损）。
- 已发生损坏：git checkout 恢复 + edit 重做是唯一正道；不要尝试编码转换"修复"。
- PowerShell 里读取中文文件核对内容时也应带 `-Encoding utf8`，否则误诊文件损坏。
