# 探索：SQLite 向量检索增强知识召回

> 性质：探索记录（brainstorm 附件，2026-10-06）。**归属（2026-10-06 用户定向拆分）：知识召回提案**——本提案自 M3.5 沉淀提案拆出（M3.5 聚焦沉淀与增量维护），本探索文档随召回提案立项归属；物理位置暂留 M3.5 目录，召回提案立项时迁引。**不改变 M3.5 范围**——向量检索维持总纲延后锚点定位，本文细化触发条件与最轻路径参数，供届时立项直用。宪法输入 = 总纲 §知识库工程机制·延后锚点（"向量/语义检索：关键词召回不足时；最轻路径 = 宿主进程内 ONNX 嵌入 + flat 余弦，维持零外部服务纪律"）。

## 1. 问题：关键词严格匹配的召回局限

现状 `knowledge_search`（core/knowledge/recall-service.ts）= keywords 精确 AND + 标题/摘要子串——**词面命中，无语义泛化**：

- 同义/改述不命中：「部署」条目遇「上线/发布」查询零命中
- 中英混排：「前端构建」vs 「frontend build」
- agent 查询天然是自然语言短语，与标签/子串匹配存在结构性错位（e2e 失败台账③已用提示词掌舵缓解，掌舵治标）

M3.5 落地后局限会更早暴露：老项目批量提取使库存瞬间变大（几百条），dogfood 真实查询密度上升——**观察窗口就在 M3.5 之后**。

## 2. 事实调研

### 2.1 sqlite-vec（asg017，SQLite 向量扩展事实标准）

- **状态**：v0.1.7-alpha（源码编译 158K dylib 实测记录）——**仍未 stable**；[SQLite 官方 vec1 扩展在开发中](https://sqlite.org/vec1/)（未发布，观察项）
- **能力**（[vec0 文档](https://github.com/asg017/sqlite-vec/blob/main/site/features/vec0.md)）：`vec0` 虚拟表 + 暴力 KNN（`embedding match ? AND k = ?`）；**metadata 列**可入 KNN WHERE（仅 `=`/`!=`/`>`/`<`/`≥`/`≤`——**不支持 LIKE**）；**partition key** 内部分片预过滤（告诫：每分片宜数百向量以上，否则过度分片反慢）；**auxiliary 列**免 JOIN 取大字段；int8/float32/bit 向量
- **集成**：npm 包 `sqlite-vec` 提供各平台预编译产物，better-sqlite3 经 `db.loadExtension()` 加载——**新增原生扩展分发面**（三平台安装包各 +1 二进制）

### 2.2 dsh-mneme 先例（dsh 生态本地嵌入的完整实测数据）

[slow-stack/mneme LOCAL_MODEL.md](https://github.com/slow-stack/mneme/blob/main/dsh-mneme/docs/LOCAL_MODEL.md)（2026-08）——dsh 插件做记忆向量检索，三 provider（local ONNX / Ollama / OpenAI API）：

| 项 | 实测数据 |
|---|---|
| 嵌入模型 | `Xenova/bge-small-zh-v1.5`（中文/中英混排优化，dim=512，q8 量化 **~100MB**，MIT） |
| 运行时闭包 | `@huggingface/transformers` 4.2 + `onnxruntime-node` + sharp：全量 **49 包 393MB**；win32 精简清单 33 包/2142 文件/数百 MB（剔除 onnxruntime-web） |
| 首次获取 | Hugging Face 下载（HF_ENDPOINT 镜像/断点续传）；或收编宿主 node_modules（硬链接近零占盘） |
| 降级 | 运行时不可用 → **自动降级关键词/BM25，读写信道永不阻断**；面板/工具暴露代价说明与取件动作 |
| 重建 | 换模型/换维度 → 全量重建索引（旧向量不可混算）；mean pooling + L2 归一化，余弦可比 |
| 其他 | 单条 8000 字符截断；批量嵌入 batch=8；CPU 推理可用；GPU 可选 |

**对本产品的启示**：闭包里的 `sharp`（图像预处理）**文本嵌入用不到**——纯文本路径的闭包可再小于 mneme；但 transformers.js + onnxruntime-node 的原生闭包是省不掉的大头。

### 2.3 规模数学（决定"要不要扩展"）

| 库存规模 | 向量体量（512d float32） | 检索路径 |
|---|---|---|
| 500 条（M3.5 冷启动导入后典型） | ~1MB | JS 内存余弦 <1ms——**零扩展需求** |
| 5,000 条 | ~10MB | JS 余弦毫秒级（域前缀先筛后更小）——仍零扩展 |
| 50,000 条 / M6 全局库跨库 | ~100MB | JS 余弦十毫秒级仍可行；sqlite-vec 的 C 实现开始有意义 |

**结论：当前与可预见规模（单库数百至数千条）下，向量检索不需要 SQLite 扩展**——`BLOB 存向量 + JS flat 余弦` 与总纲锚点"flat 余弦"完全一致。sqlite-vec/vec1 是**规模升级路径**（触发：单库 >1 万条或全局库跨库检索），届时引入 partition key（project_id 粒度）正合适。

**域前缀 × KNN 的过滤难题**（届时才需解）：vec0 metadata 不支持 LIKE——域前缀过滤只能 ①过度取 K×N 后过滤 ②按精确域 partition（过度分片风险）③取回候选行集后在 JS 算余弦（= flat 路径）。这进一步支持"当前规模走 flat"。

## 3. 目标形态设计草案（届时立项的骨架）

### 3.1 双通道混合召回

```
search(query)
  ├─ SQL 域前缀选行 + status != 'unconfirmed' 过滤（现有管线，不动）
  ├─ 通道① 关键词严格打分（现有 rankEntries——精确信号，保留）
  ├─ 通道② 向量余弦（query 嵌入 vs 条目嵌入[title+summary+keywords 嵌入文本]——语义信号）
  ├─ 融合：两通道归一化分数混排（或 RRF）——排序与置信解耦裁决不变（置信只做阈值，M5）
  └─ 运行时不可用 → 仅通道①（mneme 降级先例，零阻断）
```

### 3.2 数据与生命周期

- 向量 = **索引缓存派生数据**（新缓存表或 `knowledge_domains` 兄弟表同库：`entry_vec` BLOB 列），随 `rebuildIndex` 重建——SoT 仍是文件，零新纪律
- 嵌入时机：确认入库（`unconfirmed`→`draft`）与修订时增量嵌入；重建时批量；换模型/维度全量重嵌（mneme 先例）
- 嵌入文本 = title + summary + keywords（**摘要先行纪律**——正文不入嵌入，token 成本受控；正文嵌入留观察）
- 前置依赖：M3.5 的 status 过滤与缓存表结构先落地（向量列是缓存表的自然扩展）

### 3.3 分发与配置

- 模型与运行时闭包不进安装包默认件——**可选组件**（设置面开关/首次启用引导，代价说明先例 = mneme 面板卡片）；获取路径 = 首用下载（HF 镜像）或本地收编；安装包内嵌分发留 M8 打包期裁决
- 零外部服务纪律：进程内 ONNX 推理 ✅（对比 Qdrant/OpenAI embeddings ❌）；Ollama 可作可选 provider（本机已有者的零下载路径）

## 4. 落点建议

> 2026-10-06 增补：§6 分层混合方案（BM25 + 域描述向量）将增强拆为三层——Tier 1（FTS5 BM25）零依赖可近即落地，Tier 2/3 维持锚点。本节结论以 §6 分层表为准。

- **M3.5 不纳入**（主题纪律：沉淀与保鲜；召回增强是另一主题，且 M3.5 的域描述[InScope-9]已是召回精度的廉价改进——先观察它够不够）
- **延后锚点细化**（总纲 P5 表，随 M3.5 记账顺带修订）：
  - 触发条件细化为："**dogfood 真实查询中关键词召回漏检可观察**（零命中但人工判定应有命中，召回日志可回溯）**或单库 >5k 条**"——比原"关键词召回不足或单域 >1k 条"更可操作
  - 最轻路径更新："flat 余弦 = 缓存 BLOB + JS（零扩展，≤5k 条）；sqlite-vec（partition=project_id）为 >1 万条/全局库升级路径；嵌入 = transformers.js + bge-small-zh-v1.5 q8（mneme 先例，~100MB 模型 + 数百 MB 可选运行时闭包，降级零阻断）"
- **里程碑候选**：独立小里程碑（建议随 M7 召回可观测性之后——召回日志正是触发条件的观察仪器）；届时以本文 §3 为设计起点

## 5. 来源

- [sqlite-vec vec0 virtual table 文档](https://github.com/asg017/sqlite-vec/blob/main/site/features/vec0.md)（metadata/partition/auxiliary 全表，2026-10-06 抓取）
- [SQLite 官方 vec1（开发中）](https://sqlite.org/vec1/)
- [dsh-mneme 本地模型部署指南](https://github.com/slow-stack/mneme/blob/main/dsh-mneme/docs/LOCAL_MODEL.md)（闭包体积/降级/收编实测，2026-08）
- 本仓 `packages/core/src/knowledge/recall-service.ts`（现状管线）；总纲 §知识库工程机制·延后锚点

## 6. 增补探索：分层混合——BM25（域名/关键词）+ 向量（域描述）（2026-10-06）

> 用户定向：**域名、关键词采用 BM25（原话"BM2.5"，按 BM25 理解——无 BM2.5 算法）；域描述采用向量检索**。按字段性质分工，取代 §3 的"全条目单通道嵌入"形态。§3 降级为 Tier 3（全条目向量，锚点维持）。

### 6.1 洞察：字段性质决定检索技术

| 字段 | 性质 | 合适技术 | 理由 |
|---|---|---|---|
| 域名（路径段） | 预分词离散标签（`/` 切段） | **BM25** | 词面精确、无语义泛化需求；现状 exact-AND"缺一即排除"过脆 |
| 关键词（frontmatter tags） | 预分词离散标签 | **BM25** | 同上；BM25 给分级相关度（多词软匹配 + IDF 加权——稀有标签权重更高） |
| 域描述（`_domain.md`） | 自然语言散文 | **向量** | 同义/改述需语义匹配；**每库仅几十条**——嵌入语料极小，计算成本趋零 |

关键不对称：**索引侧字段天然预分词**（keywords 是标签、域路径切段）——BM25 无需中文分词器；**查询侧**才需要（见 6.3 缝）。

### 6.2 Tier 1 —— BM25 over FTS5（零新依赖）

- **FTS5 内建于 better-sqlite3**（默认编译开启），`bm25()` 排序函数 SQL 原生——**无原生扩展、无新 npm 依赖、三平台分发零变化**
- 形态：FTS5 表 = 索引缓存派生件（随 `rebuildIndex` 同步重建，rowid ↔ entry_id）；索引内容 = 空格预分词的 `keywords + 域路径段`（unicode61 分词器即可——索引侧已预分词）
- 查询：`keywords[]`（本就是标签，直入 MATCH）+ `text` 经词表子串扩展（§6.3）→ `MATCH ... ORDER BY bm25(...)` + 域前缀过滤（FTS 表带 domain 列或命中后按前缀过滤）
- 现有占位打分（KEYWORD_WEIGHT/TITLE_WEIGHT/SUMMARY_WEIGHT 精确 AND + 子串）退役为 `text` 兜底通道或整体替换——排序与置信解耦裁决不变
- 与 M3.5 的协同：批量导入几百条后，exact-AND 的标签方差（提取产出标签不齐）使漏检概率放大——Tier 1 直接提升"导入的条目可被找到"

### 6.3 关键设计缝：查询侧 CJK 分词

[FTS5 内建分词器对 CJK 无效](https://github.com/arjunkmrm/recall/issues/4)（unicode61 不切中文——查询"前端部署"成单 token，永不命中标签"前端"）。解法 = **词表子串扩展**（纯 JS，零原生依赖）：

- 词表 = 索引缓存内的**闭集**（全部 keywords ∪ 域路径段——每库几十至几百项，内存可载）
- 查询 `text` → 对词表做子串匹配 → 命中词表项展开为 MATCH 词项（OR 组合交 BM25 加权）
- 不引入中文分词器（jieba 类依赖）与自定义 FTS5 tokenizer（C 扩展，如 [hermes-agent fts5_cjk](https://github.com/NousResearch/hermes-agent/blob/19dc35cf577a339f1ba6f7106d37704638549ca0/native/fts5_cjk/fts5_cjk.c)——原生扩展违反零依赖纪律）
- 已知取舍：查询含词表外词（如代码标识符）时该词无贡献——由 `text` 子串兜底通道覆盖（标题/摘要子串匹配保留）

### 6.4 Tier 2 —— 域描述向量（可选组件，语料 = 每库几十条）

**四步管线（用户定向 2026-10-06 定稿）**：

1. **查询改写**：LLM 把用户输入改写为检索友好形（去口语化、提炼实体与意图）——无需嵌入模型，会话 LLM 即可承担；改写失败/退化时 **fallback = 原始输入**。
2. **域定位（向量，仅此层）**：改写输入与**域描述**（`knowledge_domains.description`）嵌入做余弦 → 定位域——**向量只用在域层，条目不嵌入**（字段性质分工的贯彻：域描述 = 少量散文，条目 = 预分词标签 + 关键词过滤）。
3. **条目筛选（关键词）**：域确定后，域内关键词细分过滤（`search` 域前缀 + keywords——与现行管线同款，零改造）。
4. **rerank**：候选重排——模型 rerank（bge-reranker 类，mneme Phase 2 先例）或 agent 复核重排（现行查找技能已固化的零依赖形态），形态届时裁决。

- 双消费场景：召回（agent 选域精度）+ 沉淀（写前结构对齐 / 拟建域归属判断）。
- 嵌入闭包成本不变（§2.2 mneme 数据：模型 ~100MB + 运行时数百 MB）——**可选组件 + 降级零阻断**（无嵌入 → 退回现行两步法 + agent rerank，检索永不失效）。
- 比 Tier 3（全条目嵌入）更早可触发：语料小、重建秒级、无逐条嵌入延迟；查找技能随之升级为四步法（提示词两步骨架不变）。

### 6.5 分层总表与落点

| Tier | 技术 | 新依赖 | 成本 | 落点建议 |
|---|---|---|---|---|
| **1** | FTS5 BM25（域名段+关键词）+ 词表扩展 | **零** | 小（recall-service 手术 + FTS5 缓存表） | **独立小里程碑紧随 M3.5**（用户裁决 2026-10-06）；M3.5 冷启动导入后的召回质量观察 = 其验收输入 |
| **2** | 域描述向量·四步管线（改写 → 域向量定位 → 关键词筛选 → rerank；向量仅域层） | 可选嵌入闭包（mneme 模式）+ 会话 LLM（改写） | 中（组件机制：下载/收编/降级） | 锚点（M7+，触发可早于 Tier 3；管线 2026-10-06 用户定向定稿，见 §6.4） |
| **3** | 全条目向量（§3 双通道） | 同上 + 逐条嵌入 | 高 | 锚点维持（>5k 条或漏检可观察） |

三 Tier 递进兼容：Tier 1 的 FTS5 表与 Tier 2 的域路由可叠加；Tier 2/3 共用同一嵌入闭包组件（一次引入，两处消费）。
