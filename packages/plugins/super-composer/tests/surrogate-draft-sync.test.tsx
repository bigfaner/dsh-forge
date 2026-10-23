// @vitest-environment happy-dom
// fix-19 双 composer 草稿同步收敛测试（bug 65b8e9d0）：
//   - 复制件编辑回写必须保 chip 真值（官方 setDraft 契约 = 纯文本整稿替换、摧毁
//     chip 节点——回写不得走该径，chip 在稿时走 bail 'slash/input-insert-text'
//     span 正门）；自身回声零写。
//   - data-face tailSpanOf 必须输出 detect 平面 span（clipboard 平面旧径 = 官方
//     span-map 契约错位，chip 在稿时 span-CAS 必败 → 替身径插入静默被吞）。
// fake 官方 world 按官方源码核销语义铸造（ui-conversation 0.2.0-rc.2 facade.ts /
// runtime.ts）：setDraft 纯文本整稿替换（occurrences 清零）、insertReference 尾插
// chip（occurrences 增长）、insert-text bail 按 detect span 插文本。
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
  occurrences: readonly { offset: number; length: number; clipboardText: string }[];
  /** setDraft spy（断言回写径） */
  setDraftCalls: string[];
}

function occurrencesOf(draft: string): FakeOfficial["occurrences"] {
  const out: NonNullable<FakeOfficial["occurrences"]> = [];
  for (const match of draft.matchAll(QUOTE_TOKEN_RE)) {
    out.push({ offset: match.index, length: match[0].length, clipboardText: match[0] });
  }
  return out;
}

function makeOfficial(): FakeOfficial {
  return { draft: "", draftRev: 0, occurrences: [], setDraftCalls: [] };
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

/** 官方 insertReference bail（tail span-CAS 尾插 chip + 空格尾规则）。 */
function officialInsertReference(official: FakeOfficial, clipboardText: string): void {
  official.draft = `${official.draft}${clipboardText} `;
  official.occurrences = occurrencesOf(official.draft);
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
  official.occurrences = occurrencesOf(official.draft);
  official.draftRev += 1;
}

/** 替身数据面桩（模型消费切片——直连 fake 官方机）。 */
function faceStubOf(official: FakeOfficial, bailSpy?: ReturnType<typeof vi.fn>): DraftSyncFace & {
  setDraft: ReturnType<typeof vi.fn>;
  insertText: ReturnType<typeof vi.fn>;
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
