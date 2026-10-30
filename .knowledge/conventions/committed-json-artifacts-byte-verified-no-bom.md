---
title: 提交的 JSON/文本产物须字节级校验防 BOM 与坏字节
summary: 本特性三轮提交产物损坏（plugin-forge 与 md-mermaid 的 package.json BOM/坏字节）阻塞 pnpm 全链；工具写文件后、提交前对关键 JSON 做字节级核验（UTF-8 无 BOM）。
keywords: [BOM, 坏字节, package.json, 提交, 构建阻塞]
status: draft
source_container: expert-squad-forge-2
source_task: expert-squad-forge-2/1.21
source_bug: 98e3e249
---

# 提交产物字节级校验（无 BOM / 无坏字节）

## 现象

- fix-4 提交损坏 plugin-forge package.json 阻塞构建（bug 9e2fc7ef）。
- fix-13 提交坏字节 package.json 致 pnpm 全链失败（bug 98e3e249）。
- md-mermaid package.json 去 BOM + 损坏 description 修复后 JSON 才可解析（commit 51b4270c）。
- r8 复测对探针遮蔽档案手工字节级核验（`2D 2D 2D`，无 BOM）方敢定论（walkthrough/retest-1.13-r8/evidence.md）。

## 避免方式

1. 由脚本/工具生成或改写的 JSON，提交前 `Get-Content -Encoding Byte` 抽查头三字节非 `EF BB BF`、关键键可 JSON.parse。
2. 构建失败且报 invalid JSON / invalid UTF-8 时，第一嫌疑是最近一次提交的产物字节，不是依赖环境。
