// expert-icon 单测（SSR 静态标记断言）：16px 档 = User + Sparkle 双官方件（双 svg）
// + 品牌蓝令牌角标；<14px = 降级纯 User glyph（单 svg、无角标）。

import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExpertIcon } from "../src-client/panel/expert-icon.js";

function render(size: number): string {
  return renderToStaticMarkup(React.createElement(ExpertIcon, { size }));
}

function svgCount(html: string): number {
  return (html.match(/<svg/g) ?? []).length;
}

describe("ExpertIcon（User + Sparkle 双官方件组合）", () => {
  it("16px 档：双 svg（User + Sparkle）+ 角标锚 + 品牌蓝语义令牌", () => {
    const html = render(16);
    expect(svgCount(html)).toBe(2);
    expect(html).toContain("data-dswf-expert-icon-sparkle");
    expect(html).toContain("var(--dsw-alias-state-business-primary)");
  });

  it("16px 档 Sparkle 缩 8px 悬右肩（负偏移绝对定位）", () => {
    const html = render(16);
    expect(html).toContain('width="8"');
    expect(html).toContain("position:absolute");
  });

  it("<14px 降级纯 User glyph：单 svg、无角标", () => {
    const html = render(12);
    expect(svgCount(html)).toBe(1);
    expect(html).not.toContain("data-dswf-expert-icon-sparkle");
  });
});
