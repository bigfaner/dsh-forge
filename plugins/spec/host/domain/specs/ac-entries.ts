// ac-entries（plugin-spec-roadmaps 1.7，code-design §1 模块ⓐ / entities.md §2）——ac_json
// 条目结构校验单点：DDL 只保 json_valid 良构，结构归本函数（零 db import 纯逻辑）。
// 五规则（entities.md §2）：① 顶层数组；② 逐项对象；③ id 非空字符串且数组内唯一（缺席
// 时服务层生成——generateId 缝注入）；④ criterion 非空字符串；⑤ address（milestone 侧）
// 存在时为非空字符串、指向存在性由 assertAddressesKnown 断言（调用方事务内重读父行后
// 调用——防 TOCTOU）。roadmap 侧条目无 address（承载指向单源存 milestone 侧）——
// allowAddress 缺省 false，带 address 即结构非法。
import type { AcEntry } from "../../db/row-types.js";
import { SpecError } from "./errors.js";

export interface ParseAcEntriesOpts {
  /** milestone 侧 true：条目可携 address 指回 roadmap AC id；roadmap 侧缺省 false */
  readonly allowAddress?: boolean;
  /** 缺席 id 的生成缝（服务层 id 单源——测试注入确定性生成器） */
  readonly generateId?: () => string;
}

/**
 * 结构校验单点（规则①–⑤语法半）：入参 raw 逐项校验 → 归一化 AcEntry[]（缺席 id 补生成）。
 * 违反任一规则 → ERR_SPEC_AC_INVALID（typed Error，禁 message 判据）。
 */
export function parseAcEntries(raw: unknown, opts: ParseAcEntriesOpts = {}): AcEntry[] {
  if (!Array.isArray(raw)) {
    throw new SpecError("ERR_SPEC_AC_INVALID", "ac_json 必须为数组", { raw });
  }
  const generateId = opts.generateId ?? (() => crypto.randomUUID());
  const seenIds = new Set<string>();
  return raw.map((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new SpecError("ERR_SPEC_AC_INVALID", "AC 条目必须为对象", { item });
    }
    const rec = item as Record<string, unknown>;
    const id = rec.id === undefined ? generateId() : rec.id;
    if (typeof id !== "string" || !id.trim()) {
      throw new SpecError("ERR_SPEC_AC_INVALID", "AC 条目 id 必须为非空字符串", { item });
    }
    if (seenIds.has(id)) {
      throw new SpecError("ERR_SPEC_AC_INVALID", `AC 条目 id 数组内重复：${id}`, { item });
    }
    seenIds.add(id);
    const criterion = rec.criterion;
    if (typeof criterion !== "string" || !criterion.trim()) {
      throw new SpecError("ERR_SPEC_AC_INVALID", "AC 条目 criterion 必须为非空字符串", { item });
    }
    const entry: AcEntry = { id, criterion };
    if (rec.address !== undefined) {
      if (opts.allowAddress !== true) {
        throw new SpecError("ERR_SPEC_AC_INVALID", "roadmap 侧条目无 address（承载指向单源存 milestone 侧）", { item });
      }
      if (typeof rec.address !== "string" || !rec.address.trim()) {
        throw new SpecError("ERR_SPEC_AC_INVALID", "AC 条目 address 存在时必须为非空字符串", { item });
      }
      entry.address = rec.address;
    }
    return entry;
  });
}

/**
 * 规则⑤存在性半：entries 的 address 全集 ⊆ parentAcIds（调用方事务内重读父 ac_json 后
 * 传入）——差集非空 → ERR_SPEC_AC_ADDRESS_UNKNOWN 携缺失 id 清单。
 */
export function assertAddressesKnown(parentAcIds: readonly string[], entries: readonly AcEntry[]): void {
  const known = new Set(parentAcIds);
  const missingIds = [...new Set(entries.map((e) => e.address).filter((a): a is string => a !== undefined && !known.has(a)))];
  if (missingIds.length > 0) {
    throw new SpecError("ERR_SPEC_AC_ADDRESS_UNKNOWN", `AC 承载指向的 roadmap AC 条目缺席：${missingIds.join(", ")}`, {
      missingIds,
    });
  }
}
