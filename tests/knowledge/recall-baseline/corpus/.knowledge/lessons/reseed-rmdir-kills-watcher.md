---
title: 重播种删目录重建杀 watch 通路——清内容保 inode
summary: >-
  夹具重播种若以 rmdir + mkdir 方式重建被 watch 的目录（chokidar 等），watcher 对旧 inode
  的监听失效，晚期用例的写径不再被感知且不报错——共享形态下表现为「早期用例绿、晚期同径用例恒红、隔离 run 绿」。修法：清空目录内容、保留目录本身。
keywords:
  - chokidar
  - watch
  - 重播种
  - inode
  - e2e
domainPath: .knowledge/lessons/
来源容器: e2e-fast-shared-launch
来源任务: first-pass 知识沉淀（1.13）；audit-xsq-batch.md 批次一归因
bug id: 无（fix-1，commit ca5b52cc）
id: reseed-rmdir-kills-watcher
status: unconfirmed
type: pitfalls
version_ts: '2026-11-05T00:00:00.000Z'
---

# 重播种删目录重建杀 watch 通路——清内容保 inode

## 规则

凡「删除目录再重建」式状态复位落在被文件监听器（chokidar / fs.watch）watch 的目录上，监听通路随旧目录 inode 一起死亡，且**静默**——不抛错、不重启，只是后续写事件丢失。重播种 / 夹具复位一律改为：保留目录本身，只清空其内容（或逐文件删除），保 inode 稳定。

## 判例

expert-squad hot-reload whitelist 用例：原始形态绿；共享 launch 形态下，重播种多轮删建 `.dsh` 子树后，晚期用例的直编写径不再触发热刷新——`--grep` 隔离 run 恒绿（18.2s）、temp-file+whitelist 组合对绿，证无用例固有耦合。修复 = reseed 清空 experts 目录内容而非删目录（支撑层一行修，fix-1，commit ca5b52cc）。

## 反例边界

- 非被 watch 的纯数据目录删建无害；判断依据是「该目录是否有 watcher 在场」，不在场即可用删建。
- 症状鉴别：早期同径用例绿 + 晚期恒红 + 隔离绿，三联齐备才指向本条；仅晚期红且隔离也红是别的问题。

## 依据

`.forge/docs/proposals/e2e-fast-shared-launch/audit-xsq-batch.md`（批次一「1 例共享 launch 耦合」归因段）。
