// expert-squad 装载位判定（bug 4d55ba98 / d64473be——纯函数；定位：基础）。
// 形态全集（两代装载行——判定须全覆盖）：
//   · insert 行（打包模板 / 老用户补行）：id = dsh-forge-expert-squad，name = @dsh-forge/expert-squad；
//   · bundle 行（dev 形态经包内 dsh.profile.bundles 装载）：id = expert-squad 短名，
//     name 形态随 loader 注入（短名 / 包名均有实测）。
// disabled 行仍在 loader entries（官方 dsh-host-plugin-inventory 同读法）——
// !disabled = 实际装载。壳掌舵门控单源（apps/web shell/boot.ts 消费 manifest 位）。
export interface LoaderEntryPresenceFace {
  readonly id?: unknown
  readonly disabled?: boolean
  readonly options?: { readonly name?: unknown }
}

/** expert-squad 行判定全集（id/name 双键 × 长/短双形态）。 */
export function isExpertSquadEntry(entry: LoaderEntryPresenceFace): boolean {
  const id = typeof entry.id === 'string' ? entry.id : undefined
  const name = typeof entry.options?.name === 'string' ? entry.options.name : undefined
  return id === 'dsh-forge-expert-squad'
    || id === 'expert-squad'
    || name === '@dsh-forge/expert-squad'
    || name === 'expert-squad'
}

/** loader entries → expert-squad 实际装载位（!disabled；读取失败由调用方 fail-open）。 */
export function expertSquadLoadedOf(entries: readonly LoaderEntryPresenceFace[]): boolean {
  return entries.some((entry) => isExpertSquadEntry(entry) && entry.disabled !== true)
}
