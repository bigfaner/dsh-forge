import { describe, expect, it } from "vitest";
import {
  QUOTE_REF_PREFIX,
  createQuoteReferenceSource,
  mentionTextOf,
  normalizeQuoteMessageText,
  quoteIdOfRef,
  quoteRefOf,
  quoteSourceAttrOf,
  serializeQuoteSnapshot,
  type QuoteSnapshot,
} from "../src/client/quote-source.js";

/** 快照基线（各用例在此上改单一字段）。 */
function snapshot(overrides: Partial<QuoteSnapshot> = {}): QuoteSnapshot {
  return {
    id: "3f9c2a1e-8b14-4c6d-9a77-2e5f0b81c9d3",
    summary: "文本引用锚定的核心是…",
    text: "文本引用锚定的核心是把一段选区映射为稳定描述符。",
    sourceType: "doc",
    sourcePath: "docs/dockkit.md",
    ...overrides,
  };
}

const ABORT = new AbortController().signal;

describe("ref scheme（quote:<uuid>）", () => {
  it("quoteRefOf / quoteIdOfRef 往返", () => {
    const id = "abc";
    expect(QUOTE_REF_PREFIX).toBe("quote:");
    expect(quoteRefOf(id)).toBe("quote:abc");
    expect(quoteIdOfRef(quoteRefOf(id))).toBe(id);
  });

  it("非 quote 引用解析为 undefined", () => {
    expect(quoteIdOfRef("bug:abc")).toBeUndefined();
    expect(quoteIdOfRef("dsh-session:x")).toBeUndefined();
  });
});

describe("候选投影（选段快照 → @ 菜单候选）", () => {
  it("offerSelection 后 candidates 投影候选行（name=id / label=摘要 / description=来源）", async () => {
    const src = createQuoteReferenceSource();
    src.offerSelection(snapshot());
    const rows = await src.candidates(
      { sessionId: "s1" },
      { query: "", position: "leading", drilled: false, signal: ABORT },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("3f9c2a1e-8b14-4c6d-9a77-2e5f0b81c9d3");
    expect(rows[0]?.label).toContain("文本引用锚定的核心");
    expect(rows[0]?.description).toBe("docs/dockkit.md");
    expect(rows[0]?.value).toBe("quote:3f9c2a1e-8b14-4c6d-9a77-2e5f0b81c9d3");
  });

  it("query 关键词过滤候选（摘要/原文命中保留）", async () => {
    const src = createQuoteReferenceSource();
    src.offerSelection(snapshot());
    src.offerSelection(snapshot({ id: "other", summary: "无关选段", text: "别的句子" }));
    const rows = await src.candidates(
      { sessionId: "s1" },
      { query: "锚定", position: "leading", drilled: false, signal: ABORT },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("3f9c2a1e-8b14-4c6d-9a77-2e5f0b81c9d3");
  });

  it("quoted=true 一律空候选（引号态 = 文件路径专属语义，bug-source 判例同则）", async () => {
    const src = createQuoteReferenceSource();
    src.offerSelection(snapshot());
    const rows = await src.candidates(
      { sessionId: "s1" },
      { query: "", quoted: true, position: "leading", drilled: false, signal: ABORT },
    );
    expect(rows).toEqual([]);
  });
});

describe("pick 与 codec 往返", () => {
  it("onPick 落快照并返回原子引用插入（ref/label/clipboardText 同径）", async () => {
    const src = createQuoteReferenceSource();
    src.offerSelection(snapshot());
    const rows = await src.candidates(
      { sessionId: "s1" },
      { query: "", position: "leading", drilled: false, signal: ABORT },
    );
    const outcome = src.onPick({
      candidate: rows[0]!,
      session: { sessionId: "s1" },
      position: "inline",
      via: "menu",
      action: "pick",
    });
    if (!outcome || !("insert" in outcome)) throw new Error("expect insert");
    expect(outcome.insert.ref).toBe("quote:3f9c2a1e-8b14-4c6d-9a77-2e5f0b81c9d3");
    expect(outcome.insert.source).toBe("quote");
    expect(outcome.insert.clipboardText).toBe(
      "〔引用：文本引用锚定的核心是…〕",
    );
  });

  it("bug aced6f28：序列化 mention 形状避开官方 file-chip 投影碰撞（无 @ token、uuid 不入明面）", () => {
    const snap = snapshot();
    const mention = mentionTextOf(snap.summary, snap.id);
    // 官方 projectUserText plain-token 形状集 = /(^|\s)(\/[\w-]+|@"…"|@[^\s]+)/
    // ——mention 不得含 `@` 起始 token，亦不得含 `/` 起始 token。
    expect(mention).not.toMatch(/@/);
    expect(mention.trim().startsWith("/")).toBe(false);
    // uuid 只落在 <quote> 结构化块（模型语境），mention 明文不暴露。
    expect(mention).not.toContain(snap.id);
    const serialized = `x ${mention} y\n${`<quote id="${quoteRefOf(snap.id)}">`}`;
    expect(serialized).toContain("〔引用：文本引用锚定的核心是…〕");
  });

  it("bug 1.32 格式改判：serializeQuoteSnapshot 只落 quote 块（无 mention 前缀行）", () => {
    const serialized = serializeQuoteSnapshot(snapshot());
    expect(serialized.startsWith(`<quote id="${quoteRefOf(snapshot().id)}"`)).toBe(true);
    expect(serialized.endsWith("</quote>")).toBe(true);
    expect(serialized).not.toContain("〔引用：");
    expect(serialized).toContain(snapshot().text);
  });

  it("source 语义：doc 选区 source={filepath}", () => {
    expect(quoteSourceAttrOf(snapshot())).toBe("docs/dockkit.md");
    expect(serializeQuoteSnapshot(snapshot())).toContain(
      `<quote id="${quoteRefOf(snapshot().id)}" source="docs/dockkit.md">`,
    );
  });

  it("source 语义：会话消息选区 source=currentSessionMsg/{seq}", () => {
    const snap = snapshot({ sourceType: "sessionMsg", sourcePath: undefined, sourceSeq: 3 });
    expect(quoteSourceAttrOf(snap)).toBe("currentSessionMsg/3");
    expect(serializeQuoteSnapshot(snap)).toContain('source="currentSessionMsg/3"');
  });

  it("source 语义：结构化字段缺席回退 legacy source；全缺 = 不出属性", () => {
    expect(quoteSourceAttrOf(snapshot({ sourceType: undefined, sourcePath: undefined }))).toBeUndefined();
    expect(quoteSourceAttrOf(snapshot({ sourcePath: undefined }))).toBeUndefined();
  });

  it("codec 往返：pick 落快照后 clipboardText（chip 投影）/ serialize（仅 quote 块）", async () => {
    const src = createQuoteReferenceSource();
    const snap = snapshot();
    src.cacheQuoteSnapshot(snap);
    const ref = quoteRefOf(snap.id);
    expect(src.codec.clipboardText(ref)).toBe(`〔引用：${snap.summary}〕`);
    const serialized = await src.codec.serialize(ref, ABORT);
    expect(serialized.trim().startsWith(`<quote id="${ref}" source="${snap.sourcePath}">`)).toBe(true);
    expect(serialized).toContain(snap.text);
    expect(serialized).toContain("</quote>");
    expect(serialized).not.toContain("〔引用：");
  });

  it("serialize 快照优先：cacheQuoteSnapshot 后补缓存即命中（无需 pick）", async () => {
    const src = createQuoteReferenceSource();
    src.cacheQuoteSnapshot(snapshot({ id: "late" }));
    const serialized = await src.codec.serialize("quote:late", ABORT);
    expect(serialized).toContain("<quote");
  });
});

describe("快照缺失回退（永不抛错）", () => {
  it("无快照 serialize 回退最小 quote 块（摘要不可用、无 mention 行、不抛错）", async () => {
    const src = createQuoteReferenceSource();
    const serialized = await src.codec.serialize("quote:ghost", ABORT);
    expect(serialized).toBe('\n\n<quote id="quote:ghost">\n摘要不可用\n</quote>\n\n');
    expect(serialized).not.toContain("〔引用：");
  });

  it("clipboardText 无快照不抛错（uuid 不入明面的兜底投影）", () => {
    const src = createQuoteReferenceSource();
    expect(() => src.codec.clipboardText("quote:ghost")).not.toThrow();
    expect(src.codec.clipboardText("quote:ghost")).toBe("〔引用：摘要不可用〕");
    expect(src.codec.clipboardText("quote:ghost")).not.toContain("ghost");
  });

  it("非 quote 引用 serialize/clipboardText 安全空投影", async () => {
    const src = createQuoteReferenceSource();
    expect(src.codec.clipboardText("file:x")).toBe("");
    await expect(src.codec.serialize("file:x", ABORT)).resolves.toBe("");
  });

  it("serialize 对畸形输入（空串）不抛错", async () => {
    const src = createQuoteReferenceSource();
    await expect(src.codec.serialize("", ABORT)).resolves.toBe("");
    expect(src.codec.clipboardText("")).toBe("");
  });
});

/**
 * 官方 sinkSerialized 拼接镜面（dsh-client-ui-conversation lib/client.js）：
 * `out += draft.slice(cursor, part.offset) + part.text` 逐 chip 展开，尾部
 * `defaultSink(out.trim(), …)`——产品代码不可改，序列化分隔只能由 codec.serialize
 * 输出形态承担。此镜面仅作单测装配面，以官方源码为承重依据。
 */
async function assembleSubmitText(
  src: ReturnType<typeof createQuoteReferenceSource>,
  draft: string,
  occurrences: readonly { offset: number; length: number; ref: string }[],
): Promise<string> {
  const parts = await Promise.all(
    occurrences.map(async (o) => ({
      offset: o.offset,
      length: o.length,
      text: await src.codec.serialize(o.ref, ABORT),
    })),
  );
  let out = "";
  let cursor = 0;
  for (const part of parts) {
    out += draft.slice(cursor, part.offset) + part.text;
    cursor = part.offset + part.length;
  }
  out += draft.slice(cursor);
  return out.trim();
}

/**
 * 完整发送链镜面 = 官方 sinkSerialized（上）+ 插件侧 sendSession 方法 wrap
 * （fix e12a37ed——AGENTS §1.1 方法 wrap 合法缝：quote-reference client 对
 * conversation 服务 sendSession 包归一化）。返回值 = 落到会话的最终消息文本。
 */
function assembleFullMessage(
  src: ReturnType<typeof createQuoteReferenceSource>,
  draft: string,
  occurrences: readonly { offset: number; length: number; ref: string }[],
): Promise<string> {
  return assembleSubmitText(src, draft, occurrences).then(normalizeQuoteMessageText);
}

describe("发送序列化拼接形态（fix-25 引用块与文本空行分隔）", () => {
  const TOKEN = "〔引用：文本引用锚定的核心是…〕";

  it("引用块 + 其后文本：块尾与文本之间空行分隔", async () => {
    const src = createQuoteReferenceSource();
    src.cacheQuoteSnapshot(snapshot());
    const draft = `${TOKEN}请看这段`;
    const out = await assembleFullMessage(src, draft, [{ offset: 0, length: TOKEN.length, ref: quoteRefOf(snapshot().id) }]);
    expect(out).toMatch(/<\/quote>\n\n请看这段$/);
  });

  it("引用块 + 其前文本：文本与块之间空行分隔", async () => {
    const src = createQuoteReferenceSource();
    src.cacheQuoteSnapshot(snapshot());
    const draft = `先看这个${TOKEN}`;
    const out = await assembleFullMessage(src, draft, [{ offset: 4, length: TOKEN.length, ref: quoteRefOf(snapshot().id) }]);
    expect(out).toMatch(/^先看这个\n\n<quote /);
    expect(out.endsWith("</quote>")).toBe(true);
  });

  it("仅引用块：消息首尾不残留空行", async () => {
    const src = createQuoteReferenceSource();
    src.cacheQuoteSnapshot(snapshot());
    const out = await assembleFullMessage(src, TOKEN, [{ offset: 0, length: TOKEN.length, ref: quoteRefOf(snapshot().id) }]);
    expect(out.startsWith("<quote ")).toBe(true);
    expect(out.endsWith("</quote>")).toBe(true);
  });

  it("多 chip + 文本：块与块、块与文本之间均恰一空行分隔", async () => {
    const src = createQuoteReferenceSource();
    src.cacheQuoteSnapshot(snapshot());
    src.cacheQuoteSnapshot(snapshot({ id: "second", text: "第二段引用全文" }));
    const draft = `${TOKEN}${TOKEN}总结一下`;
    const out = await assembleFullMessage(src, draft, [
      { offset: 0, length: TOKEN.length, ref: quoteRefOf(snapshot().id) },
      { offset: TOKEN.length, length: TOKEN.length, ref: quoteRefOf("second") },
    ]);
    expect(out).toMatch(/<\/quote>\n\n<quote /);
    expect(out).toMatch(/<\/quote>\n\n总结一下$/);
    expect(out.startsWith("<quote ")).toBe(true);
  });
});

describe("块间空行归一化（bug e12a37ed 相邻块间双空行）", () => {
  const TOKEN = "〔引用：文本引用锚定的核心是…〕";

  it("三引用相邻：块间各恰一空行（无连续 ≥3 换行）、首尾零空行", async () => {
    const src = createQuoteReferenceSource();
    src.cacheQuoteSnapshot(snapshot());
    src.cacheQuoteSnapshot(snapshot({ id: "second", text: "第二段引用全文" }));
    src.cacheQuoteSnapshot(snapshot({ id: "third", text: "第三段引用全文" }));
    const draft = `${TOKEN}${TOKEN}${TOKEN}`;
    const out = await assembleFullMessage(src, draft, [
      { offset: 0, length: TOKEN.length, ref: quoteRefOf(snapshot().id) },
      { offset: TOKEN.length, length: TOKEN.length, ref: quoteRefOf("second") },
      { offset: TOKEN.length * 2, length: TOKEN.length, ref: quoteRefOf("third") },
    ]);
    expect(out).toMatch(/^<quote /);
    expect(out).toMatch(/<\/quote>\n\n<quote \n?[^]*<\/quote>\n\n<quote /);
    expect(out).not.toMatch(/\n{3,}/);
    expect(out.endsWith("</quote>")).toBe(true);
  });

  it("文本夹引用间：文本与两侧引用块各恰一空行", async () => {
    const src = createQuoteReferenceSource();
    src.cacheQuoteSnapshot(snapshot());
    src.cacheQuoteSnapshot(snapshot({ id: "second", text: "第二段引用全文" }));
    const draft = `${TOKEN}中间这段话${TOKEN}`;
    const out = await assembleFullMessage(src, draft, [
      { offset: 0, length: TOKEN.length, ref: quoteRefOf(snapshot().id) },
      { offset: TOKEN.length + 5, length: TOKEN.length, ref: quoteRefOf("second") },
    ]);
    expect(out).toMatch(/<\/quote>\n\n中间这段话\n\n<quote /);
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("normalizeQuoteMessageText 恒等面：无 quote 块文本零改动（非介入面零行为差异）", () => {
    const text = "普通消息\n\n\n保留多空行\n\n尾";
    expect(normalizeQuoteMessageText(text)).toBe(text);
  });

  it("normalizeQuoteMessageText：含 quote 块的文本连续 ≥3 换行收敛为恰一空行", () => {
    const text = '<quote id="quote:a">\nx\n</quote>\n\n\n\n<y> 后文';
    expect(normalizeQuoteMessageText(text)).toBe('<quote id="quote:a">\nx\n</quote>\n\n<y> 后文');
    expect(normalizeQuoteMessageText(`  ${text}`)).toBe('<quote id="quote:a">\nx\n</quote>\n\n<y> 后文');
  });
});

describe("共存约束②——不实现 lexicon", () => {
  it("source 无 lexicon / subscribeLexicon 面（与 bug-source 同则：引用只以原子 chip / 明文投影存在）", () => {
    const src = createQuoteReferenceSource();
    expect("lexicon" in src).toBe(false);
    expect("subscribeLexicon" in src).toBe(false);
    const record = src as unknown as Record<string, unknown>;
    expect(Object.keys(record).some((key) => key.toLowerCase().includes("lexicon"))).toBe(false);
  });
});
