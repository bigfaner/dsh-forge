import { describe, expect, it } from "vitest";
import {
  QUOTE_REF_PREFIX,
  createQuoteReferenceSource,
  mentionTextOf,
  quoteIdOfRef,
  quoteRefOf,
  type QuoteSnapshot,
} from "../src/client/quote-source.js";

/** 快照基线（各用例在此上改单一字段）。 */
function snapshot(overrides: Partial<QuoteSnapshot> = {}): QuoteSnapshot {
  return {
    id: "3f9c2a1e-8b14-4c6d-9a77-2e5f0b81c9d3",
    summary: "文本引用锚定的核心是…",
    text: "文本引用锚定的核心是把一段选区映射为稳定描述符。",
    source: "dockkit 文档示例：锚定与重定位",
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
    expect(rows[0]?.description).toBe("dockkit 文档示例：锚定与重定位");
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
      "@[文本引用锚定的核心是…](quote:3f9c2a1e-8b14-4c6d-9a77-2e5f0b81c9d3)",
    );
  });

  it("codec 往返：pick 落快照后 clipboardText / serialize 命中全量（mention + <quote> 块）", async () => {
    const src = createQuoteReferenceSource();
    const snap = snapshot();
    src.cacheQuoteSnapshot(snap);
    const ref = quoteRefOf(snap.id);
    expect(src.codec.clipboardText(ref)).toBe(
      `@[${snap.summary}](${ref})`,
    );
    const serialized = await src.codec.serialize(ref, ABORT);
    expect(serialized).toContain(`@[${snap.summary}](${ref})`);
    expect(serialized).toContain(`<quote id="${ref}" source="${snap.source}">`);
    expect(serialized).toContain(snap.text);
    expect(serialized).toContain("</quote>");
  });

  it("serialize 快照优先：cacheQuoteSnapshot 后补缓存即命中（无需 pick）", async () => {
    const src = createQuoteReferenceSource();
    src.cacheQuoteSnapshot(snapshot({ id: "late" }));
    const serialized = await src.codec.serialize("quote:late", ABORT);
    expect(serialized).toContain("<quote");
  });
});

describe("快照缺失回退（永不抛错）", () => {
  it("无快照 serialize 回退最小块（mention 保留、不追加 quote 块、不抛错）", async () => {
    const src = createQuoteReferenceSource();
    const serialized = await src.codec.serialize("quote:ghost", ABORT);
    expect(serialized).toBe(mentionTextOf("ghost 摘要不可用", "ghost"));
    expect(serialized).not.toContain("<quote");
  });

  it("clipboardText 无快照不抛错（ref id 兜底投影）", () => {
    const src = createQuoteReferenceSource();
    expect(() => src.codec.clipboardText("quote:ghost")).not.toThrow();
    expect(src.codec.clipboardText("quote:ghost")).toBe("@[ghost 摘要不可用](quote:ghost)");
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

describe("共存约束②——不实现 lexicon", () => {
  it("source 无 lexicon / subscribeLexicon 面（与 bug-source 同则：引用只以原子 chip / 明文投影存在）", () => {
    const src = createQuoteReferenceSource();
    expect("lexicon" in src).toBe(false);
    expect("subscribeLexicon" in src).toBe(false);
    const record = src as unknown as Record<string, unknown>;
    expect(Object.keys(record).some((key) => key.toLowerCase().includes("lexicon"))).toBe(false);
  });
});
