// ac-entries 单测（plugin-spec-roadmaps 1.7，code-design §1 模块ⓐ）——parseAcEntries
// 结构分支（零 db 纯函数直喂）+ assertAddressesKnown 缺失 id 拒绝。
import { describe, expect, it } from "vitest";
import { assertAddressesKnown, parseAcEntries } from "../../host/domain/specs/ac-entries.js";
import { isSpecError } from "../../host/domain/specs/errors.js";

describe("parseAcEntries（结构校验单点——entities.md §2 五规则）", () => {
  it("数组形 + 逐项 criterion 非空 + 服务层补 id（缺省 id 生成、uuid 面）", () => {
    const entries = parseAcEntries(
      [{ criterion: "导出能力可用" }, { id: "ac-1", criterion: "性能达标" }],
      { generateId: (() => `gen-${++parseSeq}`) as () => string },
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: "gen-1", criterion: "导出能力可用" });
    expect(entries[1]).toMatchObject({ id: "ac-1", criterion: "性能达标" });
  });

  it("① 顶层数组拒：非数组 → ERR_SPEC_AC_INVALID", () => {
    try {
      parseAcEntries("not-array");
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_INVALID");
    }
  });

  it("② 逐项对象拒：条目非对象 → ERR_SPEC_AC_INVALID", () => {
    expect(() => parseAcEntries(["str"]).length).toBeDefined();
    try {
      parseAcEntries(["str"]);
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_INVALID");
    }
  });

  it("③ id 非空且数组内唯一：空 id / 重 id → ERR_SPEC_AC_INVALID", () => {
    for (const raw of [[{ id: "", criterion: "x" }], [{ id: "a", criterion: "x" }, { id: "a", criterion: "y" }]]) {
      try {
        parseAcEntries(raw);
        throw new Error("should throw");
      } catch (e) {
        expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_INVALID");
      }
    }
  });

  it("④ criterion 非空：缺失/空白 → ERR_SPEC_AC_INVALID", () => {
    for (const raw of [[{}], [{ id: "a", criterion: "   " }]]) {
      try {
        parseAcEntries(raw);
        throw new Error("should throw");
      } catch (e) {
        expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_INVALID");
      }
    }
  });

  it("⑤ address 语法：非空字符串；milestone 侧（allowAddress）合法、roadmap 侧拒", () => {
    expect(parseAcEntries([{ id: "m", criterion: "x", address: "r1" }], { allowAddress: true })[0]?.address).toBe("r1");
    try {
      parseAcEntries([{ id: "m", criterion: "x", address: "r1" }]);
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_INVALID");
    }
    try {
      parseAcEntries([{ id: "m", criterion: "x", address: "" }], { allowAddress: true });
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_INVALID");
    }
  });
});

describe("assertAddressesKnown（⑤ 事务内指向存在——缺失 id 清单随错误携带）", () => {
  it("指向集差集非空 → ERR_SPEC_AC_ADDRESS_UNKNOWN 携缺失 id 清单", () => {
    try {
      assertAddressesKnown(["r1"], [{ id: "m", criterion: "x", address: "r2" }]);
      throw new Error("should throw");
    } catch (e) {
      expect(isSpecError(e) && e.code).toBe("ERR_SPEC_AC_ADDRESS_UNKNOWN");
      expect(isSpecError(e) && e.data.missingIds).toEqual(["r2"]);
    }
  });

  it("全部指向在场 / 自发起零 address → 通过", () => {
    assertAddressesKnown(["r1", "r2"], [
      { id: "m", criterion: "x", address: "r1" },
      { id: "m2", criterion: "y" },
    ]);
  });
});

let parseSeq = 0;
