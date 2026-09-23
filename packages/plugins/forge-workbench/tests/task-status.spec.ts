import { describe, expect, it } from 'vitest'
import {
  TASK_STATUSES, TASK_STATUS_DOT_STATE, TASK_STATUS_LABEL_KEYS, TASK_STATUS_SHORT_LABEL_KEYS,
  isTaskStatus, taskStatusLabel, taskStatusShortLabel,
} from '../src/client/i18n/task-status.ts'
import type { TaskStatus } from '../src/client/ipc-types.ts'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'

// Task 5.5 — the shared task-status vocabulary units (the layer 5.7/5.9
// consume): canonical 7-态 order, complete label routing with en/zh parity,
// the 7→5 StateDot reduction, and the narrowers.

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

describe('TASK_STATUSES: the canonical vocabulary', () => {
  it('holds exactly the 7 态, in the canonical board order (B columns + status sort)', () => {
    expect([...TASK_STATUSES]).toEqual([
      'pending', 'in_progress', 'completed', 'blocked', 'suspended', 'skipped', 'rejected',
    ])
  })

  it('isTaskStatus narrows the vocabulary and rejects everything else', () => {
    for (const status of TASK_STATUSES) expect(isTaskStatus(status)).toBe(true)
    expect(isTaskStatus('done')).toBe(false)
    expect(isTaskStatus('in-progress')).toBe(false)
    expect(isTaskStatus('')).toBe(false)
    expect(isTaskStatus(undefined)).toBe(false)
    expect(isTaskStatus(7)).toBe(false)
  })
})

describe('the label routing: complete, balanced, injective', () => {
  it('maps every status to a full-label and a short-label key', () => {
    for (const status of TASK_STATUSES) {
      expect(typeof TASK_STATUS_LABEL_KEYS[status]).toBe('string')
      expect(typeof TASK_STATUS_SHORT_LABEL_KEYS[status]).toBe('string')
    }
  })

  it('every routed key resolves to non-empty copy in BOTH locales (parity)', () => {
    for (const status of TASK_STATUSES) {
      for (const key of [TASK_STATUS_LABEL_KEYS[status], TASK_STATUS_SHORT_LABEL_KEYS[status]]) {
        expect(en[key].trim().length).toBeGreaterThan(0)
        expect(zh[key].trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('full labels are pairwise distinct (the accessible 状态全称 never collide)', () => {
    const labels = TASK_STATUSES.map(status => en[TASK_STATUS_LABEL_KEYS[status]])
    expect(new Set(labels).size).toBe(TASK_STATUSES.length)
    const zhLabels = TASK_STATUSES.map(status => zh[TASK_STATUS_LABEL_KEYS[status]])
    expect(new Set(zhLabels).size).toBe(TASK_STATUSES.length)
  })

  it('taskStatusLabel / taskStatusShortLabel route through the seat', () => {
    const status: TaskStatus = 'in_progress'
    expect(taskStatusLabel(status, t.en)).toBe(en['tasks.status.in_progress'])
    expect(taskStatusShortLabel(status, t.en)).toBe(en['tasks.status.short.in_progress'])
    expect(taskStatusLabel(status, t.zh)).toBe(zh['tasks.status.in_progress'])
    expect(taskStatusShortLabel(status, t.zh)).toBe(zh['tasks.status.short.in_progress'])
  })
})

describe('TASK_STATUS_DOT_STATE: the 7→5 upstream StateDot reduction', () => {
  it('maps every status into the five upstream visuals', () => {
    const visuals = ['done', 'warning', 'ongoing', 'error', 'idle'] as const
    for (const status of TASK_STATUSES) {
      expect(visuals).toContain(TASK_STATUS_DOT_STATE[status])
    }
  })

  it('lands the semantic anchors: completed=done, in_progress=ongoing, rejected=error, blocked=warning', () => {
    expect(TASK_STATUS_DOT_STATE.completed).toBe('done')
    expect(TASK_STATUS_DOT_STATE.in_progress).toBe('ongoing')
    expect(TASK_STATUS_DOT_STATE.rejected).toBe('error')
    expect(TASK_STATUS_DOT_STATE.blocked).toBe('warning')
  })
})
