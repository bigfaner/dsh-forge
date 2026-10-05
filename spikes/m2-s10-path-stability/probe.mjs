// S10 spike：canonical path 字符串稳定性探针（M2 db-schema §7-14 排程，PRD 前）。
//
// 问题：M2 每工作区 DB 目录名 = `{flatten(canonical)}-{hash8(canonical)}`（§6-34：
//   hash8 = sha-256 前 8 hex 小写，输入 = canonical path 字符串本机原样）。
//   同一物理目录经不同路径形态（大小写 / 8.3 短名 / junction / subst）注册，
//   canonical 化后字符串是否恒同 → hash8 是否恒同？不稳定 = 同一工作区裂成
//   两个 forge.db（孤儿库风险，F10-①/S10 语境）。
//
// 基准实现：core canonicalizeDir（project-service.ts）= `realpath`（node:fs/promises，
//   libuv JS 实现——P1 现行为）。每形态双测：js realpath / realpathSync.native
//   （GetFinalPathNameByHandle——真值拼写候选）。收敛判据 = 同组形态的
//   canonical→flatten+hash8 组内全同。
//
// 分组：A = tmp 夹具（原样/大写/混合大小写/junction/subst 互为变体）
//      B = 本 worktree（原样/全大写互为变体——真实工作区形态）
//      C = %TEMP% 夹具（8.3 短名 vs 长名——C: 卷短名探测；Z: 卷未产短名）
// 用法：node probe.mjs（自建夹具，结束清理；subst/ junction 无需管理员）
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const flatten = (p) => p.replace(/[\\/]/g, '-').replace(/:/g, '')
const hash8 = (p) => createHash('sha256').update(p, 'utf8').digest('hex').slice(0, 8)
const key = (p) => `${flatten(p)}-${hash8(p)}`
const jsRealpath = async (p) => { try { return await realpath(p) } catch { return null } }
const nativeRealpath = (p) => { try { return realpathSync.native(p) } catch { return null } }

// ── 夹具 ──
const SCRATCH = 'Z:\\project\\dsh\\tmp-redesign\\s10'
const FIXTURE = join(SCRATCH, 'fixture-proj')
const JUNCTION = join(SCRATCH, 'jn-link')
rmSync(SCRATCH, { recursive: true, force: true })
mkdirSync(FIXTURE, { recursive: true })
execSync(`cmd /c mklink /J "${JUNCTION}" "${SCRATCH}"`)
const SUBST_LETTER = ['Y', 'W', 'V', 'U', 'T'].find((l) => !existsSync(`${l}:\\`)) ?? null
if (SUBST_LETTER) execSync(`subst ${SUBST_LETTER}: "${SCRATCH}"`)

// C: 8.3 探测夹具（长名含分隔符 >8.3 规则 → 短名 FIXTUR~1 形）
const C83_DIR = join(tmpdir(), 's10-eight-dot-three')
const C83_LONG = join(C83_DIR, 'fixture-longproj')
rmSync(C83_DIR, { recursive: true, force: true })
mkdirSync(C83_LONG, { recursive: true })
function dirShortOf(dir, longName) {
  try {
    const out = execSync(`cmd /c dir /x /a:d "${dir}"`, { encoding: 'utf8' })
    const re = new RegExp(`<DIR>\\s+(\\S+~\\d)\\s+${longName}`, 'i')
    const m = out.match(re)
    return m?.[1] ?? null
  } catch { return null }
}
const c83Short = dirShortOf(C83_DIR, 'fixture-longproj')

// ── 形态登记（组 → 形态列表）──
const groups = []
const addGroup = (name, items) => groups.push({ name, items })
addGroup('A·tmp 夹具（变体互证）', [
  ['A1 原样', FIXTURE],
  ['A2 全大写', FIXTURE.toUpperCase()],
  ['A3 混合大小写', 'Z:\\Project\\Dsh\\Tmp-Redesign\\S10\\Fixture-PROJ'],
  ['A4 junction', join(JUNCTION, 'fixture-proj')],
  ...(SUBST_LETTER ? [['A5 subst 盘符', `${SUBST_LETTER}:\\fixture-proj`]] : []),
])
addGroup('B·真工作区（本 worktree）', [
  ['B1 原样（cwd）', process.cwd()],
  ['B2 全大写', process.cwd().toUpperCase()],
])
if (c83Short) {
  addGroup('C·8.3 短名（%TEMP% / C: 卷）', [
    ['C1 长名', C83_LONG],
    ['C2 短名段', join(C83_DIR, c83Short)],
  ])
}

// ── 探测 + 报告 ──
console.log(`subst 盘符 = ${SUBST_LETTER ? `${SUBST_LETTER}: 已映射` : 'skip（无空闲字母）'}；8.3 短名（C:） = ${c83Short ?? '未产生（卷禁用）'}\n`)
let allStable = true
for (const g of groups) {
  console.log(`── ${g.name} ──`)
  const results = []
  for (const [label, p] of g.items) {
    const a = await jsRealpath(p)
    const b = nativeRealpath(p)
    results.push({ label, a, b })
    console.log(`  ${label.padEnd(14)} in : ${p}`)
    console.log(`  ${''.padEnd(14)} js : ${a ?? '—'}${a ? `   → key ${key(a)}` : ''}`)
    console.log(`  ${''.padEnd(14)} nat: ${b ?? '—'}${b ? `   → key ${key(b)}` : ''}`)
  }
  const jsKeys = new Set(results.map((r) => r.a).filter(Boolean).map(key))
  const natKeys = new Set(results.map((r) => r.b).filter(Boolean).map(key))
  const jsStable = jsKeys.size === 1
  const natStable = natKeys.size === 1
  allStable = allStable && jsStable
  console.log(`  ⇒ js realpath 组内收敛: ${jsStable ? 'YES（同 key）' : `NO（${jsKeys.size} 个 key）`}；native 组内收敛: ${natStable ? 'YES（同 key）' : `NO（${natKeys.size} 个 key）`}\n`)
}
console.log(`[S10 总判] js realpath（core 现行为）：${allStable ? '全部形态收敛——hash8 稳定' : '存在不收敛形态——见上'}`)

// ── 清理 ──
if (SUBST_LETTER) execSync(`subst ${SUBST_LETTER}: /D`)
try { execSync(`cmd /c rmdir "${JUNCTION}"`) } catch { /* ignore */ }
rmSync(SCRATCH, { recursive: true, force: true })
rmSync(C83_DIR, { recursive: true, force: true })
console.log('（夹具/映射已清理）')
