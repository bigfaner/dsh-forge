// worker-exec-evidence-replay 1.3 测试 —— 续跑指针读取（领取瞬间证据位探测）：
// 指针文件在盘 → logs/ 相对路径（正斜杠）；缺席/容器目录缺席 = undefined（首跑零行）。
// 路径形状与 notify/incident-log 同树同净化口径（logs/<slug>/<taskKey>/<file>）。
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readEvidencePointer, RESUME_POINTER_FILE } from './evidence-pointer.js'
import { RESUME_POINTER_FILE as POINTER_NAME } from './prompt/compose.js'

describe('1.3 readEvidencePointer（领取瞬间证据位探测——fail-soft）', () => {
  it('常量同源：测试与约束块共享 RESUME_POINTER_FILE 单点定义', () => {
    expect(RESUME_POINTER_FILE).toBe('resume.md')
    expect(POINTER_NAME).toBe(RESUME_POINTER_FILE)
  })

  it('指针文件在盘 → `logs/<slug>/<localId>/resume.md` 相对路径（正斜杠）', () => {
    const container = mkdtempSync(join(tmpdir(), 'forge-evidence-ptr-'))
    mkdirSync(join(container, 'logs', 'feat-x', '1.3'), { recursive: true })
    writeFileSync(join(container, 'logs', 'feat-x', '1.3', RESUME_POINTER_FILE), '进度', 'utf8')
    expect(readEvidencePointer(container, 'feat-x', '1.3')).toBe('logs/feat-x/1.3/resume.md')
  })

  it('指针文件缺席（目录在）→ undefined（首跑零行）', () => {
    const container = mkdtempSync(join(tmpdir(), 'forge-evidence-ptr-'))
    mkdirSync(join(container, 'logs', 'feat-y', '2.1'), { recursive: true })
    expect(readEvidencePointer(container, 'feat-y', '2.1')).toBeUndefined()
  })

  it('容器目录缺席 → undefined（fail-soft 不抛）', () => {
    expect(readEvidencePointer(undefined, 'feat-x', '1.3')).toBeUndefined()
    expect(readEvidencePointer('', 'feat-x', '1.3')).toBeUndefined()
    expect(readEvidencePointer('/nonexistent-container-zz', 'feat-x', '1.3')).toBeUndefined()
  })

  it('slug/localId 净化（同 incident-log 口径：非法字符折叠连字符）——净化后定位同一目录', () => {
    const container = mkdtempSync(join(tmpdir(), 'forge-evidence-ptr-'))
    mkdirSync(join(container, 'logs', 'feat-x', '1.3'), { recursive: true })
    writeFileSync(join(container, 'logs', 'feat-x', '1.3', RESUME_POINTER_FILE), '', 'utf8')
    expect(readEvidencePointer(container, 'feat x', '1.3')).toBe('logs/feat-x/1.3/resume.md')
  })
})
