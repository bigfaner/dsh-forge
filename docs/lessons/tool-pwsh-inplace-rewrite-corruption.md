---
created: 2026-10-02
tags: [pwsh, file-editing, encoding]
title: "pwsh 原地重写会静默损坏大文件——文件编辑一律用 edit 工具"
severity: high
---

# pwsh 原地重写会静默损坏大文件——文件编辑一律用 edit 工具

## 现象

对 ~300 行中文 Markdown 执行 `Get-Content $f -Raw` + `-replace` + `Set-Content $f -NoNewline -Encoding utf8` 的原地重命名替换后，文件从 298 行缩到 178 行（约 40% 内容静默丢失），且首行被注入 BOM（`﻿`）。git diff 显示 249 删 129 增的大面积破坏——**命令本身零报错，退出码 0**。

## 根因

pwsh 管道读写的编码/内容往返在含大量非 ASCII 与特定结构的文件上不保证字节保真；`-Encoding utf8` 在部分宿主加 BOM。损坏是**静默**的——不抛错、不截断报错，事后才能从行数/git diff 发现。

## 教训

1. **文件内容修改一律用 edit 工具**（old_string/new_string 字面替换，读写由宿主保证保真；本会话数百次编辑零事故）。
2. pwsh 只做不可变操作（读、查询、git）——若必须批量替换，先写到**新文件**并 diff 校验后再替换，或干脆分次用 edit 的 `replace_all`。
3. 动手前有 git 干净基线 + 改后立即 `git diff --stat` 校验，损坏可秒级恢复（本次靠 `git checkout --` 恢复，净损失为零）。

## 现场

dsh-forge tech-research.md 包名同步（2026-10-02）：损坏 → git 恢复 → 改用 edit 工具 `replace_all` 重做，一次成功。
