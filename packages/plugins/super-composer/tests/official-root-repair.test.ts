// @vitest-environment happy-dom
// fix-21（bug 0cf1818b）：S2 工厂桥官方 composer 副本卸载后 shell editor root 失联
// ——主视图官方 composer 空白（官方 ComposerContentEditable 每实例只绑一次 root，
// cleanup setRootElement(null) 后无人重绑；官方源码核销 ui-conversation
// input/editor/ComposerContentEditable.tsx:31-32 + input/facade.ts shell-owned editor）。
// 修复缝 = 替身组合层检测「shell editor root 为 null ∧ 主 composer editable 在场」
// 时重绑（官方 Lexical setRootElement 正门，语义同官方绑定 effect）。
import { describe, expect, it } from "vitest";
import { rebindMainComposerRoot, type EditorRootFace } from "../src/client/index.js";

function freshDoc(): Document {
  return document.implementation.createHTMLDocument("fix-21");
}

function mainInput(doc: Document): HTMLElement {
  const el = doc.createElement("div");
  el.setAttribute("data-composer-input", "");
  el.setAttribute("contenteditable", "true");
  doc.body.appendChild(el);
  return el;
}

function surrogateInput(doc: Document): HTMLElement {
  const host = doc.createElement("div");
  host.setAttribute("data-dscf-official-input", "");
  const el = doc.createElement("div");
  el.setAttribute("data-composer-input", "");
  host.appendChild(el);
  doc.body.appendChild(host);
  return el;
}

function editorStub(root: unknown): EditorRootFace & { setRootCalls: unknown[] } {
  const setRootCalls: unknown[] = [];
  return {
    getRootElement: () => root,
    setRootElement: (el: unknown) => {
      setRootCalls.push(el);
    },
    setRootCalls,
  };
}

describe("fix-21: S2 卸载后 shell editor root 重绑主 composer（bug 0cf1818b）", () => {
  it("root=null ∧ 主 editable 在场 → 重绑主 editable（返回 true）", () => {
    const doc = freshDoc();
    const main = mainInput(doc);
    const editor = editorStub(null);
    expect(rebindMainComposerRoot(doc, editor)).toBe(true);
    expect(editor.setRootCalls).toEqual([main]);
  });

  it("root 在场（绑定健康）→ 不动作（零干预）", () => {
    const doc = freshDoc();
    mainInput(doc);
    const editor = editorStub(doc.createElement("div"));
    expect(rebindMainComposerRoot(doc, editor)).toBe(false);
    expect(editor.setRootCalls).toHaveLength(0);
  });

  it("无主 editable（主视图未挂载）→ 不动作（不铸造孤儿 root）", () => {
    const doc = freshDoc();
    surrogateInput(doc); // 只有替身复制件 editable——非官方主 composer
    const editor = editorStub(null);
    expect(rebindMainComposerRoot(doc, editor)).toBe(false);
    expect(editor.setRootCalls).toHaveLength(0);
  });

  it("替身复制件 editable 不作重绑目标（data-dscf-official-input 子树排除）", () => {
    const doc = freshDoc();
    surrogateInput(doc);
    const editor = editorStub(null);
    expect(rebindMainComposerRoot(doc, editor)).toBe(false);
    expect(editor.setRootCalls).toHaveLength(0);
  });

  it("editor 面漂移（undefined / 缺方法）→ fail-soft 不抛", () => {
    const doc = freshDoc();
    mainInput(doc);
    expect(rebindMainComposerRoot(doc, undefined)).toBe(false);
    expect(rebindMainComposerRoot(doc, {} as EditorRootFace)).toBe(false);
    expect(
      rebindMainComposerRoot(doc, {
        getRootElement: "not-a-fn",
        setRootElement: () => undefined,
      } as unknown as EditorRootFace),
    ).toBe(false);
  });

  it("setRootElement 抛（官方面漂移）→ fail-soft 返回 false", () => {
    const doc = freshDoc();
    mainInput(doc);
    const editor: EditorRootFace = {
      getRootElement: () => null,
      setRootElement: () => {
        throw new Error("drifted");
      },
    };
    expect(rebindMainComposerRoot(doc, editor)).toBe(false);
  });
});
