import { describe, expect, it } from 'vitest'
import { createUpdateBannerState, type UpdateBannerState } from '../src/main/update-banner-state/index.ts'

function recorder(): { states: UpdateBannerState[]; onState: (s: UpdateBannerState) => void } {
  const states: UpdateBannerState[] = []
  return { states, onState: (s) => { states.push(s) } }
}

describe('UF3 UpdateBannerState machine (task 5.3)', () => {
  it('hidden → shown on update-available when no mask is up', () => {
    const rec = recorder()
    const machine = createUpdateBannerState({ onState: rec.onState })
    machine.reportAvailable('0.2.0')
    expect(machine.getState()).toEqual({ phase: 'shown', version: '0.2.0' })
    expect(rec.states).toEqual([{ phase: 'shown', version: '0.2.0' }])
  })

  it('hidden → queued while the UF4 mask is up; queued → shown when the mask exits', () => {
    const rec = recorder()
    const machine = createUpdateBannerState({ onState: rec.onState })
    machine.setMaskActive(true)
    expect(rec.states).toEqual([]) // mask alone never emits
    machine.reportAvailable('0.2.0')
    expect(machine.getState()).toEqual({ phase: 'queued', version: '0.2.0' })
    machine.setMaskActive(true) // idempotent
    expect(machine.getState().phase).toBe('queued')
    machine.setMaskActive(false) // mask exits (recovery → recovered)
    expect(machine.getState()).toEqual({ phase: 'shown', version: '0.2.0' })
    expect(rec.states).toEqual([
      { phase: 'queued', version: '0.2.0' },
      { phase: 'shown', version: '0.2.0' },
    ])
  })

  it('a banner already shown stays shown when the mask enters (mask covers it, z1200 > z1100)', () => {
    const machine = createUpdateBannerState()
    machine.reportAvailable('0.2.0')
    machine.setMaskActive(true)
    machine.setMaskActive(false)
    expect(machine.getState()).toEqual({ phase: 'shown', version: '0.2.0' })
  })

  it('dismissed is terminal for this run: later update arrivals and mask exits are ignored', () => {
    const rec = recorder()
    const machine = createUpdateBannerState({ onState: rec.onState })
    machine.reportAvailable('0.2.0')
    machine.dismiss()
    machine.dismiss() // no double emit
    machine.reportAvailable('0.3.0')
    machine.setMaskActive(true)
    machine.reportAvailable('0.4.0')
    machine.setMaskActive(false)
    expect(machine.getState()).toEqual({ phase: 'dismissed' })
    expect(rec.states).toEqual([
      { phase: 'shown', version: '0.2.0' },
      { phase: 'dismissed' },
    ])
  })

  it('a queued banner can still be dismissed while the mask is up', () => {
    const machine = createUpdateBannerState()
    machine.setMaskActive(true)
    machine.reportAvailable('0.2.0')
    machine.dismiss()
    machine.setMaskActive(false)
    expect(machine.getState()).toEqual({ phase: 'dismissed' })
  })

  it('empty version reports are ignored', () => {
    const rec = recorder()
    const machine = createUpdateBannerState({ onState: rec.onState })
    machine.reportAvailable('')
    expect(machine.getState()).toEqual({ phase: 'hidden' })
    expect(rec.states).toEqual([])
  })

  it('refreshes the version in place when a new check arrives while shown', () => {
    const rec = recorder()
    const machine = createUpdateBannerState({ onState: rec.onState })
    machine.reportAvailable('0.2.0')
    machine.reportAvailable('0.3.0')
    expect(machine.getState()).toEqual({ phase: 'shown', version: '0.3.0' })
    expect(rec.states).toEqual([
      { phase: 'shown', version: '0.2.0' },
      { phase: 'shown', version: '0.3.0' },
    ])
  })
})
