// remote-envelope 单测（跨插件 client 半信封解包单源——先例族锚：
// expert-squad model-catalog / config-jump listBundles 判例）。
import { describe, expect, it } from "vitest";
import { remoteValueOf } from "./remote-envelope.js";

describe("remoteValueOf（Typert RemoteResult 信封解包）", () => {
  it("ok 信封 → value 原样（对象/数组/原始值透传）", () => {
    const rows = [{ name: "@dsh-forge/forge", rows: [] }];
    expect(remoteValueOf({ ok: true, value: rows })).toBe(rows);
    expect(remoteValueOf({ ok: true, value: { groups: [] } })).toEqual({ groups: [] });
    expect(remoteValueOf({ ok: true, value: "headhunter" })).toBe("headhunter");
    expect(remoteValueOf({ ok: true, value: undefined })).toBeUndefined();
  });

  it("!ok / 非信封 / 畸形 / null / 原始值 = undefined（fail-soft 归调用方兜底）", () => {
    expect(remoteValueOf({ ok: false, error: { code: "x", message: "y" } })).toBeUndefined();
    expect(remoteValueOf({ value: 1 })).toBeUndefined(); // 缺 ok 位非信封
    expect(remoteValueOf([1, 2])).toBeUndefined(); // 裸数组非信封
    expect(remoteValueOf("raw")).toBeUndefined();
    expect(remoteValueOf(null)).toBeUndefined();
    expect(remoteValueOf(undefined)).toBeUndefined();
  });
});
