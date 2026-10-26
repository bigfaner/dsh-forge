// panel 样式令牌守门（fix-14）：错误态令牌必须用官方正名 --dsw-alias-state-error-primary
//（全仓 126 处正名先例），禁用不存在的 --dsw-alias-state-danger-primary——var() 无效
// 回落继承色，错误态文本双主题呈灰而非 Error 红。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MSEL_MENU_MAX_PX } from "../src-client/panel/detail-logic.js";

const stylesSource = readFileSync(
  fileURLToPath(new URL("../src-client/panel/styles.ts", import.meta.url)),
  "utf-8",
);

describe("panel styles 令牌正名（error-primary）", () => {
  const ruleOf = (selector: string): string =>
    stylesSource
      .split("\n")
      .find((line) => line.includes(selector + " {")) ?? "";

  it("错误态面消费官方正名 --dsw-alias-state-error-primary（errorbar + dlg-err）", () => {
    expect(ruleOf(".dswf-errorbar")).toContain("var(--dsw-alias-state-error-primary)");
    expect(ruleOf(".dswf-dlg-err")).toContain("var(--dsw-alias-state-error-primary)");
  });

  it("不消费不存在的 --dsw-alias-state-danger-primary", () => {
    expect(stylesSource).not.toContain("--dsw-alias-state-danger-primary");
  });

  it("bug 25c91ebd 回归：msel 菜单为 position:fixed（脱离 .dswf-dlg-body overflow:auto 裁切——溢出 Dialog 展示），不再 absolute", () => {
    const menuRule = ruleOf(".dswf-msel-menu");
    expect(menuRule).toContain("position: fixed");
    expect(menuRule).not.toContain("position: absolute");
  });

  it("m2: msel 菜单 max-height 与 placement 封顶常量单点对齐（消费 MSEL_MENU_MAX_PX = 220）", () => {
    const menuRule = ruleOf(".dswf-msel-menu");
    expect(menuRule).toContain("max-height: ${MSEL_MENU_MAX_PX}px");
    expect(MSEL_MENU_MAX_PX).toBe(220);
  });

  it("1.67 裁决：头部唯一分隔线在头部容器底；来源行自身无边框（无双分隔线）且次级色弱化", () => {
    expect(ruleOf(".dswf-dlg-head")).toContain("border-bottom");
    const barRule = ruleOf(".dswf-dlg-origin-bar");
    expect(barRule).not.toContain("border-bottom");
    expect(barRule).toContain("var(--dsw-alias-label-secondary)");
  });
});
