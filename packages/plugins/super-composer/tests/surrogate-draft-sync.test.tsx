// @vitest-environment happy-dom
// fix-19 双 composer 草稿同步收敛测试（bug 65b8e9d0）：
//   - 复制件编辑回写必须保 chip 真值（官方 setDraft 契约 = 纯文本整稿替换、摧毁
//     chip 节点——回写不得走该径，chip 在稿时走 bail 'slash/input-insert-text'
//     span 正门）；自身回声零写。
//   - data-face tailSpanOf 必须输出 detect 平面 span（clipboard 平面旧径 = 官方
//     span-map 契约错位，chip 在稿时 span-CAS 必败 → 替身径插入静默被吞）。
// fix-18（bug d7fe1ab6）：setDraft 兜底摧毁官方 chip → 发送链零 occurrence 跳过
//   serializeReference，`〔引用：…〕` 明文原样落会话消息——兜底后按备忘逆序重物化。
// fake 官方 world 按官方源码核销语义铸造（ui-conversation 0.2.0-rc.2 facade.ts /
// runtime.ts）：setDraft 纯文本整稿替换（occurrences 清零）、insertReference span
// 覆盖域替换 chip（$replaceDetectSpanWithNodes）、insert-text bail 按 detect span 插文本。
import { describe, expect, it, vi } from "vitest";
import { tailSpanOf } from "../src/client/data-face.js";
import {
  SurrogateComposerModel,
  insertDeltaOf,
  detectOffsetAtClipboardOffset,
  type DraftSyncFace,
} from "../src/client/official-input/surrogate-composer.js";

// ─────────────────────────── fake 官方草稿机（官方语义） ───────────────────────────

const QUOTE_TOKEN_RE = /〔引用：([^〕\n]*)〕/g;

interface FakeOfficial {
  draft: string;
  draftRev: number;
  occurrences: readonly {
    offset: number;
    length: number;
    clipboardText: string;
    source?: string;
    ref?: string;
    label?: string;
  }[];
  /** setDraft spy（断言回写径） */
  setDraftCalls: string[];
  /** occurrences 投影是否带 chip 真值（legacy 无 ref 面测试旗标） */
  withChipTruth: boolean;
}

function occurrencesOf(draft: string, withChipTruth: boolean): FakeOfficial["occurrences"] {
  const out: NonNullable<FakeOfficial["occurrences"]> = [];
  for (const match of draft.matchAll(QUOTE_TOKEN_RE)) {
    const clipboardText = match[0];
    const label = match[1] ?? "";
    out.push(
      withChipTruth
        ? // 官方 $projectComposer 投影带 chip 真值（source/ref/label/clipboardText）
          { source: "quote", ref: `quote:${label}`, offset: match.index, length: clipboardText.length, label, clipboardText }
        : { offset: match.index, length: clipboardText.length, clipboardText },
    );
  }
  return out;
}

function makeOfficial(withChipTruth = true): FakeOfficial {
  return { draft: "", draftRev: 0, occurrences: [], setDraftCalls: [], withChipTruth };
}

/** 官方 setDraft 契约（facade.ts:215 → runtime.setDraft）：等值早退；否则纯文本
 * 整稿替换——chip 节点摧毁（occurrences 清零、token 落明文）。 */
function officialSetDraft(official: FakeOfficial, text: string): void {
  official.setDraftCalls.push(text);
  if (text === official.draft) return;
  official.draft = text;
  official.occurrences = [];
  official.draftRev += 1;
}

/** 官方 insertReference bail（span 覆盖域换 chip + 尾插规则——测试用尾插形态）。 */
function officialInsertReference(official: FakeOfficial, clipboardText: string): void {
  official.draft = `${official.draft}${clipboardText} `;
  official.occurrences = occurrencesOf(official.draft, official.withChipTruth);
  official.draftRev += 1;
}

/** detect 坐标 → clipboard 坐标（官方 span-map 平面契约：chip 在 detect 投影坍缩 1 字符）。 */
function detectToClipboard(official: FakeOfficial, detectTarget: number): number {
  const tokens = [...official.occurrences].sort((a, b) => a.offset - b.offset);
  let clipboard = 0;
  let detect = 0;
  for (const occ of tokens) {
    const plainLen = occ.offset - clipboard;
    if (detectTarget <= detect + plainLen) return clipboard + (detectTarget - detect);
    clipboard = occ.offset + occ.length;
    detect += plainLen + 1;
  }
  return clipboard + Math.max(0, detectTarget - detect);
}

/** 官方 insert-text bail（detect span → clipboard 平面换算后插文本）。 */
function officialInsertText(official: FakeOfficial, text: string, start: number): void {
  const clipboardAt = detectToClipboard(official, start);
  official.draft = official.draft.slice(0, clipboardAt) + text + official.draft.slice(clipboardAt);
  official.occurrences = occurrencesOf(official.draft, official.withChipTruth);
  official.draftRev += 1;
}

/** 替身数据面桩（模型消费切片——直连 fake 官方机）。 */
function faceStubOf(
  official: FakeOfficial,
  bailSpy?: ReturnType<typeof vi.fn>,
): DraftSyncFace & {
  setDraft: ReturnType<typeof vi.fn>;
  insertText: ReturnType<typeof vi.fn>;
  insertReference: ReturnType<typeof vi.fn>;
  notify(): void;
} {
  let listener: (() => void) | null = null;
  const state = () => ({
    draft: official.draft,
    draftRev: official.draftRev,
    phase: "plain" as const,
    occurrences: official.occurrences,
    queue: [],
  });
  const face = {
    state,
    notify: () => listener?.(),
    inputState: state,
    setDraft: vi.fn((text: string) => officialSetDraft(official, text)),
    insertText: vi.fn((text: string, span: { start: number; end: number; draftRev: number }) => {
      bailSpy?.("slash/input-insert-text", { text, span });
      officialInsertText(official, text, span.start);
      return true;
    }),
    // 官方 insertReference 契约（draftEditor.insertReference）：span 覆盖域被 chip
    // 节点替换（$replaceDetectSpanWithNodes）——重物化径的 fake 同语义。
    insertReference: vi.fn(
      (
        reference: { source: string; ref: string; label: string; clipboardText: string },
        span: { start: number; end: number; draftRev: number },
      ) => {
        bailSpy?.("slash/input-insert-reference", { reference, span });
        official.draft =
          official.draft.slice(0, span.start) + reference.clipboardText + official.draft.slice(span.end);
        official.occurrences = occurrencesOf(official.draft, official.withChipTruth);
        official.draftRev += 1;
        return true;
      },
    ),
    trackMention: vi.fn(),
    mention: () => undefined,
    subscribe(l: () => void) {
      listener = l;
      return () => {
        listener = null;
      };
    },
  };
  return face;
}

// ─────────────────────────── 失败测试（修复前红） ───────────────────────────

describe("fix-19: 复制件编辑回写不摧毁官方 chip 真值（bug 65b8e9d0）", () => {
  it("引用 chip 在稿时复制件端打字 → 官方草稿保 chip（occurrences 不清零、bail insert-text 正门）", () => {
    const official = makeOfficial();
    const bailSpy = vi.fn();
    const face = faceStubOf(official, bailSpy);
    const model = new SurrogateComposerModel(face, () => {});
    model.start();
    // 添加到会话：引用落官方草稿（bail 正门径）
    officialInsertReference(official, "〔引用：文档摘要〕");
    face.notify();
    // 复制件已回灌 chip 投影
    expect(model.runtime.projection.clipboardText).toBe("〔引用：文档摘要〕 ");
    // 复制件端打字（尾部插入）
    model.runtime.paste("hi");
    // 修复后：chip 仍在官方 editor（occurrences 保真）；修复前 setDraft 全文替换 → 0
    expect(official.occurrences).toHaveLength(1);
    expect(official.draft).toBe("〔引用：文档摘要〕 hi");
    expect(bailSpy).toHaveBeenCalledWith(
      "slash/input-insert-text",
      expect.objectContaining({ text: "hi" }),
    );
  });

  it("官方回声（复制件回灌后零差异）→ 零回写（不触碰官方 setDraft）", () => {
    const official = makeOfficial();
    const face = faceStubOf(official);
    const model = new SurrogateComposerModel(face, () => {});
    model.start();
    official.draft = "预置草稿";
    official.draftRev = 1;
    face.notify();
    expect(model.runtime.projection.clipboardText).toBe("预置草稿");
    expect(face.setDraft).not.toHaveBeenCalled();
  });

  it("chip 在稿时破坏性编辑（删除）→ 回落 setDraft（症状级兜底，不炸）", () => {
    const official = makeOfficial();
    const face = faceStubOf(official);
    const model = new SurrogateComposerModel(face, () => {});
    model.start();
    officialInsertReference(official, "〔引用：文档摘要〕");
    face.notify();
    model.runtime.clearCommittedDraft(() => null); // 全清 = 破坏性编辑
    expect(official.draft).toBe("");
    expect(face.setDraft).toHaveBeenCalledWith("");
  });

  it("无 chip 草稿打字 → setDraft 径不变（无损面零改动）", () => {
    const official = makeOfficial();
    const face = faceStubOf(official);
    const faceSetDraft = face.setDraft;
    const model = new SurrogateComposerModel(face, () => {});
    model.start();
    model.runtime.paste("hello");
    expect(faceSetDraft).toHaveBeenCalledWith("hello");
    expect(official.draft).toBe("hello");
  });
});

// ─────────────────────────── fix-18：setDraft 兜底后 chip 重物化（bug d7fe1ab6） ───────────────────────────
//
// 根因链：writeBack 兜底 face.setDraft（官方契约 = 纯文本整稿替换）摧毁官方 chip 节点
// （occurrences 清零）→ 官方发送链 sinkSerialized 对零 occurrence 草稿跳过
// serializeReference → clipboard 投影 `〔引用：…〕` 明文原样落会话消息。
// 修复：兜底 setDraft 后按 label→reference 备忘逆序把幸存 token 重物化为官方 chip
//（insertReference span 覆盖域替换语义，官方 draftEditor.insertReference 核销）。

describe("fix-18: setDraft 兜底不摧毁 quote chip 真值（bug d7fe1ab6）", () => {
  it("chip 在稿破坏性差量（回落 setDraft）→ 官方 chip 重物化（occurrences 保真，token 不落明文）", () => {
    const official = makeOfficial();
    const face = faceStubOf(official);
    const model = new SurrogateComposerModel(face, () => {});
    model.start();
    officialInsertReference(official, "〔引用：文档摘要〕");
    face.notify();
    // 复制件端破坏性差量：删去尾部空格（长度收缩 = 非纯插入 → 旧径 setDraft 兜底）
    model.runtime.setDraft("〔引用：文档摘要〕");
    // 修复后：token 被换回官方 chip（occurrences 1）；修复前 occurrences=0 → 发送明文
    expect(official.occurrences).toHaveLength(1);
    expect(official.draft).toBe("〔引用：文档摘要〕");
    expect(face.insertReference).toHaveBeenCalledWith(
      expect.objectContaining({ source: "quote", ref: "quote:文档摘要", clipboardText: "〔引用：文档摘要〕" }),
      expect.objectContaining({ start: 0, end: 9 }),
    );
  });

  it("insert-text 正门漂移回落 setDraft → 同径重物化（纯插入丢 chip 面同堵）", () => {
    const official = makeOfficial();
    const face = faceStubOf(official);
    face.insertText.mockReturnValueOnce(false); // bail 正门漂移
    const model = new SurrogateComposerModel(face, () => {});
    model.start();
    officialInsertReference(official, "〔引用：文档摘要〕");
    face.notify();
    model.runtime.paste("hi");
    expect(official.occurrences).toHaveLength(1);
    expect(official.draft).toBe("〔引用：文档摘要〕 hi");
  });

  it("多 chip 稿破坏性差量 → 全部幸存 token 逆序重物化（offset 不漂移）", () => {
    const official = makeOfficial();
    const face = faceStubOf(official);
    const model = new SurrogateComposerModel(face, () => {});
    model.start();
    officialSetDraft(official, "〔引用：甲〕 和 〔引用：乙〕");
    official.occurrences = occurrencesOf(official.draft, true);
    official.draftRev = 1;
    face.notify();
    model.runtime.setDraft("〔引用：甲〕 〔引用：乙〕"); // 删「 和 」
    expect(official.draft).toBe("〔引用：甲〕 〔引用：乙〕");
    expect(official.occurrences).toHaveLength(2);
  });

  it("无 chip 真值备忘（legacy occurrences 无 ref）→ 保持 setDraft 兜底现行为（不重物化、不炸）", () => {
    const official = makeOfficial(false);
    const face = faceStubOf(official);
    const model = new SurrogateComposerModel(face, () => {});
    model.start();
    officialInsertReference(official, "〔引用：文档摘要〕");
    face.notify();
    model.runtime.setDraft("〔引用：文档摘要〕");
    expect(face.insertReference).not.toHaveBeenCalled();
    expect(official.draft).toBe("〔引用：文档摘要〕");
  });
});

describe("fix-19: 回写增量纯函数", () => {
  it("insertDeltaOf：纯插入识别（公共前后缀收敛）", () => {
    expect(insertDeltaOf("〔引用：a〕 ", "〔引用：a〕 hi")).toEqual({ at: 7, text: "hi" });
    expect(insertDeltaOf("abc", "axbc")).toEqual({ at: 1, text: "x" });
    expect(insertDeltaOf("abc", "ab")).toBeUndefined(); // 删除 = 非纯插入
    expect(insertDeltaOf("abc", "xyz")).toBeUndefined(); // 替换 = 非纯插入
  });

  it("detectOffsetAtClipboardOffset：clipboard → detect 平面换算（chip 坍缩 1 字符）", () => {
    // 草稿 = 〔引用：文档摘要〕(8 字符 clipboard → 1 detect) + "hi"
    const occ = [{ offset: 0, length: 8, clipboardText: "〔引用：文档摘要〕" }];
    expect(detectOffsetAtClipboardOffset("〔引用：文档摘要〕hi", occ, 10)).toBe(3);
    expect(detectOffsetAtClipboardOffset("〔引用：文档摘要〕hi", occ, 0)).toBe(0);
    expect(detectOffsetAtClipboardOffset("plain", [], 3)).toBe(3);
  });
});

describe("fix-19: data-face tailSpanOf 对齐 detect 平面（043166fc 同源漂移）", () => {
  it("chip 在稿：tail span = draft 长度 − Σ(chip 长 − 1)（clipboard 平面旧径否决）", () => {
    const draft = "〔引用：文档摘要〕x";
    const span = tailSpanOf({
      draft,
      draftRev: 4,
      occurrences: [{ offset: 0, length: 9, clipboardText: "〔引用：文档摘要〕" } as never],
    });
    expect(span).toEqual({ start: 2, end: 2, draftRev: 4 });
  });

  it("无 chip：tail span = draft 长度（现行为保持）", () => {
    expect(tailSpanOf({ draft: "abc", draftRev: 1, occurrences: [] })).toEqual({
      start: 3,
      end: 3,
      draftRev: 1,
    });
  });
});
