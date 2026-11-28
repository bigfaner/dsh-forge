---
title: Node Buffer.includes 把多字节序列写成一个数恒为假
summary: >-
  Buffer.includes(0x0d0a) 里的 0x0d0a 是单个数值而非两字节序列，按单字节查找恒为 false；据此判定行尾后 split
  会把整个文件当成一行，按行删除即整文件删空（判例 cordis.patch.yml）。判行尾须逐字节比较或对文本用
  includes('\r\n')，改写脚本写回前加形态守卫。
keywords:
  - buffer
  - includes
  - crlf
  - 行尾
  - 字节序列
  - 脚本事故
  - 文件删空
id: node-buffer-includes
status: unconfirmed
version_ts: '2026-11-28T14:47:57.849Z'
updated: '2026-11-28T14:47:57.849Z'
type: pitfalls
candidate_of: stale-host-runtime-nullifies-semantic-remedies
---
# Node Buffer.includes 把多字节序列写成一个数恒为假

## 现象

一次性脚本里判断文件是否 CRLF：

```js
const eol = buf.includes(0x0d0a) ? '\r\n' : '\n'   // 错
```

`0x0d0a` 是一个数值（3338），不是「两个字节 0x0D 0x0A」。`Buffer.includes(number)` 按单字节值查找，而合法字节范围是 0–255，所以**恒为 false**——纯 LF 文件恰好得到正确结果，错误被掩盖；一旦据此 `split(eol)`，整个文件被当成一行，后续按「命中行」删除就把整文件删空。

判例：`plugins/forge/cordis.patch.yml`（22021 字节、纯 LF）被整文件删空，靠 `git checkout` 恢复。

## 正确写法

- 判行尾：逐字节比较 `buf[i] === 0x0d && buf[i + 1] === 0x0a`，或对文本用 `text.includes('\r\n')`；
- 改写前加形态守卫：行数异常少、命中数不为 1 时抛错拒绝改动，而不是继续写回。

## 关联

- 用脚本改写文件前先 `git status` 确认该文件干净，出错可 `git checkout -- <file>` 恢复；
- 与「PowerShell 文本重写损坏中文」同属一类：**改写源码的脚本必须字节级严谨，写回前校验形态**。

溯源：来源容器 plugins-remediation-m2b-iron-rule-settlement；来源任务 主会话收口清账。
