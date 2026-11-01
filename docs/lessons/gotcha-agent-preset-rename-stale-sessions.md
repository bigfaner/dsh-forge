# Gotcha：agent preset 改名后遗留会话使召唤复用死 id；部署侧手工配置段须随发版装配回收

- 判例日期：2026-11-01。
- 症状：专家团「寻访」报 `agent-preset/not-found: Unknown agent preset: hr`，换 bundle、清缓存、重启均无效。
- bugId：`1d73f61f-ce8d-41e6-8975-abd0a7219a45`（双根因，已 fixed）。

## 根因一：预设改名后 stale 会话被官方复用机械复活（dev）

- 预设 `hr` 改名 `headhunter` 后，早期以 `hr` 创建且仍挂在工作区下的 blank 会话成为死结：寻访走官方 `openWorkspace → reuseOrCreateBlank`（`dsh-client-ui-workspace`），命中 blank 会话即以旧 sessionId adopt；宿主 adopt 链（`dsh-api-session-controller/lib/index.js` `createOrAdopt`）按**会话出生 header 的旧 preset id** `resolve` —— header 不可变铁律下这是既成事实，注册表无此 id 即抛 not-found。
- 报错发生在 **create 阶段**且与客户端 bundle 版本无关——凡见「改了 id/换了产物仍报旧值」，先查会话数据与持久化状态，别只盯代码。
- 处置：把 stale 会话归档（UI），或停机后从 `storages/workspace.json` 的 `sessionIds` 摘除 + 移出 `storages/session_projcache/sessions/<id>.json`（备份留盘）。**不要**给死 id 在 overlay 加别名行——那会把改名前的遗留长期合法化。

## 根因二：部署侧手工配置段未随发版装配回收（打包版）

- 用户曾向 `profile/cordis.patch.yml` 手工注入 `preset-hr` 行；产品 boot 链随后自带 hr 装配（boot overlay 每启注行）后，该段未按其自身注释回收 → 同 id 双 insert（官方 `applyEntryPatches` 的无 id insert 是 push 语义）→ 组合树出现两个 `id: hr` 预设行，注册失效。
- 排查手法：`dsh --dump-config [--patch overlay.yml]` 离线组合实况，数同名行即实锤；修补后再 dump 验证单行。
- 纪律：手工配置段的注释里写明回收条件（本例已有「boot 链含 hr 装配后应移除本段」），发版装配落地时**必须执行回收**；patch 层叠加语义是「按 id 覆写 / insert 追加」，双 insert 不去重。

## 排查路径备忘

- dev 日志 renderer console 落盘：`userdata.dev/logs/app-*.jsonl`（`"event":"console"`）。
- 预设装配三层：bundle 出厂行 → profile 用户层 `cordis.patch.yml` → boot overlay（每启重写，宿主每启从 dist presets 底稿物化）。改预设 id 时三层 + 历史会话数据四方都要对齐。
- 探针脚本留盘：`cdp/cdp-summon-probe.mjs`、`cdp/cdp-summon-evidence.mjs`。
