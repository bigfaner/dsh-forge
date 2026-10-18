// worker-exec-evidence-replay 1.3 测试 —— 续跑指针读取（领取瞬间证据位探测）：
// 指针文件在盘 → logs/ 相对路径（正斜杠）；缺席/容器目录缺席 = undefined（首跑零行）。
// 路径形状与 notify/incident-log 同树同净化口径（logs/<slug>/<taskKey>/<file>）。
// disc 效度戳跟进 —— 三态判定：同 HEAD+基线 = 复用（fresh）；HEAD 漂移 = stale 强制重跑；
// 基线签名漂移 = stale 强制重跑；无戳存量证据（1.16 判例通道）= stale。
// R1-major① f913fc49：core 零 IO 纪律——本套件注入内存 io（受控成败），纯函数化零真盘/
// 零子进程；生产实现（git 取数 + node:fs 适配）的真机回归落装配面 index.validity-domain.test.ts。
import { describe, expect, it } from 'vitest'
import {
  readEvidencePointer,
  readEvidencePointerState,
  RESUME_POINTER_FILE,
  RESUME_VALIDITY_FILE,
  stampMatches,
  writeEvidenceValidityStamp,
  type EvidencePointerIo,
  type EvidenceValidityStamp,
} from './evidence-pointer.js'
import { RESUME_POINTER_FILE as POINTER_NAME } from './prompt/compose.js'

const FRESH: EvidenceValidityStamp = { head: 'aaaa', baseline: 'b1' }

/** 内存证据位 io（core 零 IO 纪律测试桩——同签名受控成败，故障经 throwOn 后缀注入） */
function makeIo(files: Map<string, string> = new Map()): EvidencePointerIo & { throwOn: string | null } {
  const io = {
    throwOn: null as string | null,
    exists: (p: string) => !(io.throwOn !== null && p.endsWith(io.throwOn)) && files.has(p),
    readTextFile: (p: string) => {
      if (io.throwOn !== null && p.endsWith(io.throwOn)) throw new Error('io 桩注入故障')
      const v = files.get(p)
      if (v === undefined) throw new Error('ENOENT（桩）')
      return v
    },
    writeTextFile: (p: string, d: string) => {
      if (io.throwOn !== null && p.endsWith(io.throwOn)) throw new Error('io 桩注入故障')
      files.set(p, d)
    },
  }
  return io
}

/** 证据位夹具：resume.md 在盘 + 可选效度戳 sidecar（内存 io） */
function evidenceWith(io: ReturnType<typeof makeIo>, stamp?: EvidenceValidityStamp, slug = 'feat-x', localId = '1.3'): void {
  const dir = `C:/container/logs/${slug}/${localId}`
  io.writeTextFile(`${dir}/${RESUME_POINTER_FILE}`, '进度')
  if (stamp !== undefined) io.writeTextFile(`${dir}/${RESUME_VALIDITY_FILE}`, JSON.stringify(stamp))
}

describe('1.3 readEvidencePointer（领取瞬间证据位探测——fail-soft）', () => {
  it('常量同源：测试与约束块共享 RESUME_POINTER_FILE 单点定义', () => {
    expect(RESUME_POINTER_FILE).toBe('resume.md')
    expect(POINTER_NAME).toBe(RESUME_POINTER_FILE)
  })

  it('指针文件在盘 → `logs/<slug>/<localId>/resume.md` 相对路径（正斜杠）', () => {
    const io = makeIo()
    evidenceWith(io)
    expect(readEvidencePointer(io, 'C:/container', 'feat-x', '1.3')).toBe('logs/feat-x/1.3/resume.md')
  })

  it('指针文件缺席（目录在）→ undefined（首跑零行）', () => {
    const io = makeIo()
    expect(readEvidencePointer(io, 'C:/container', 'feat-y', '2.1')).toBeUndefined()
  })

  it('容器目录缺席 → undefined（fail-soft 不抛）', () => {
    const io = makeIo()
    expect(readEvidencePointer(io, undefined, 'feat-x', '1.3')).toBeUndefined()
    expect(readEvidencePointer(io, '', 'feat-x', '1.3')).toBeUndefined()
    expect(readEvidencePointer(io, 'C:/nonexistent-container-zz', 'feat-x', '1.3')).toBeUndefined()
  })

  it('io.exists 注入故障 → undefined（fail-soft 不抛）', () => {
    const io = makeIo()
    evidenceWith(io)
    io.throwOn = RESUME_POINTER_FILE
    expect(readEvidencePointer(io, 'C:/container', 'feat-x', '1.3')).toBeUndefined()
  })

  it('slug/localId 净化（同 incident-log 口径：非法字符折叠连字符）——净化后定位同一目录', () => {
    const io = makeIo()
    evidenceWith(io)
    expect(readEvidencePointer(io, 'C:/container', 'feat x', '1.3')).toBe('logs/feat-x/1.3/resume.md')
  })
})

describe('disc 效度戳——三态判定（同 HEAD 复用 / HEAD 漂移 / 基线签名漂移）', () => {
  it('效度戳一致（同 HEAD + 同基线签名）→ 复用（fresh，resume 语义不变）', () => {
    const io = makeIo()
    evidenceWith(io, FRESH)
    expect(readEvidencePointerState(io, 'C:/container', 'feat-x', '1.3', FRESH)).toEqual({
      pointer: 'logs/feat-x/1.3/resume.md',
      stale: false,
    })
  })

  it('HEAD 漂移（代码基线推进）→ stale 强制重跑（指针仍在——简报注入 stale 规则段）', () => {
    const io = makeIo()
    evidenceWith(io, FRESH)
    const drifted: EvidenceValidityStamp = { head: 'bbbb', baseline: 'b1' }
    const state = readEvidencePointerState(io, 'C:/container', 'feat-x', '1.3', drifted)
    expect(state.pointer).toBe('logs/feat-x/1.3/resume.md')
    expect(state.stale).toBe(true)
  })

  it('基线签名漂移（依赖环境变化）→ stale 强制重跑', () => {
    const io = makeIo()
    evidenceWith(io, FRESH)
    const drifted: EvidenceValidityStamp = { head: 'aaaa', baseline: 'b2' }
    expect(readEvidencePointerState(io, 'C:/container', 'feat-x', '1.3', drifted).stale).toBe(true)
  })

  it('无戳存量证据（disc 前形态——1.16 判例通道）→ stale（不可证效度）', () => {
    const io = makeIo()
    evidenceWith(io) // 仅 resume.md，无 sidecar
    expect(readEvidencePointerState(io, 'C:/container', 'feat-x', '1.3', FRESH).stale).toBe(true)
  })

  it('戳形坏 / sidecar 读故障 → stale（fail-soft 不抛）', () => {
    const io = makeIo()
    evidenceWith(io, FRESH)
    io.writeTextFile('C:/container/logs/feat-x/1.3/resume.validity.json', '{broken')
    expect(readEvidencePointerState(io, 'C:/container', 'feat-x', '1.3', FRESH).stale).toBe(true)
    io.throwOn = RESUME_VALIDITY_FILE
    expect(readEvidencePointerState(io, 'C:/container', 'feat-x', '1.3', FRESH).stale).toBe(true)
  })

  it('当前效度域不可读（current 缺席）→ 机制惰性不判（fresh，形态兼容）', () => {
    const io = makeIo()
    evidenceWith(io) // 无戳也不判
    expect(readEvidencePointerState(io, 'C:/container', 'feat-x', '1.3', undefined)).toEqual({
      pointer: 'logs/feat-x/1.3/resume.md',
      stale: false,
    })
  })

  it('stampMatches（纯函数）：双域全等 = true，任一漂移 = false', () => {
    expect(stampMatches(FRESH, FRESH)).toBe(true)
    expect(stampMatches(FRESH, { head: 'x', baseline: 'b1' })).toBe(false)
    expect(stampMatches(FRESH, { head: 'aaaa', baseline: 'x' })).toBe(false)
  })
})

describe('disc 效度戳——写侧（1.16 判例回归——注入 io 形态）', () => {
  it('1.16 判例回归：首轮结算落戳 → fix 落地 HEAD 推进 → 重领比对 = stale 强制重跑', () => {
    const io = makeIo()
    evidenceWith(io, undefined, 'proposal-x', '1.16')
    const firstDomain: EvidenceValidityStamp = { head: '1111', baseline: 'b1' }
    // 首轮结算写侧落戳（同 HEAD 同基线）
    expect(writeEvidenceValidityStamp(io, 'C:/container', 'proposal-x', '1.16', firstDomain)).toBe(true)
    expect(readEvidencePointerState(io, 'C:/container', 'proposal-x', '1.16', firstDomain).stale).toBe(false)
    // fix 落地（HEAD 推进）后重领：机械比对漂移 → stale（陈旧证据复用通道封死）
    const secondDomain: EvidenceValidityStamp = { head: '2222', baseline: 'b1' }
    expect(readEvidencePointerState(io, 'C:/container', 'proposal-x', '1.16', secondDomain).stale).toBe(true)
  })

  it('写侧 fail-soft：resume.md 缺席 = false 不落戳；写后 sidecar 在盘且可回读；写故障 = false', () => {
    const io = makeIo()
    expect(writeEvidenceValidityStamp(io, 'C:/container', 'feat-x', '1.3', FRESH)).toBe(false)
    evidenceWith(io)
    expect(writeEvidenceValidityStamp(io, 'C:/container', 'feat-x', '1.3', FRESH)).toBe(true)
    expect(io.readTextFile('C:/container/logs/feat-x/1.3/resume.validity.json')).toBe(
      `${JSON.stringify(FRESH, null, 2)}\n`,
    )
    io.throwOn = RESUME_VALIDITY_FILE
    expect(writeEvidenceValidityStamp(io, 'C:/container', 'feat-x', '1.3', FRESH)).toBe(false)
  })
})
