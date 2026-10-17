/**
 * 自写 hash router（~60 行口径）：5 路由 + 浮层管理（浮层不走路由）。
 * hash 源注入——单测不依赖 window。
 */

export type RouteName = 'chat' | 'drawer' | 'hero' | 'settings' | 'models'

export interface RouteMatch {
  readonly name: RouteName
  readonly params: Readonly<Record<string, string>>
}

type HashSource = {
  get(): string
  set(hash: string): void
  subscribe(listener: () => void): () => void
}

const PATTERNS: readonly (readonly [RouteName, string])[] = [
  ['chat', '#/chat/:id'],
  ['drawer', '#/drawer'],
  ['hero', '#/hero'],
  ['settings', '#/settings'],
  ['models', '#/models'],
]

function matchHash(hash: string): RouteMatch | null {
  const path = hash.split('?')[0] ?? ''
  for (const [name, pattern] of PATTERNS) {
    const patternParts = pattern.split('/')
    const pathParts = path.split('/')
    if (patternParts.length !== pathParts.length) continue
    const params: Record<string, string> = {}
    let matched = true
    for (let i = 0; i < patternParts.length; i++) {
      const expected = patternParts[i] ?? ''
      const actual = pathParts[i] ?? ''
      if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual)
      else if (expected !== actual) {
        matched = false
        break
      }
    }
    if (matched) return { name, params }
  }
  return null
}

export interface Overlay {
  readonly id: string
  readonly element: unknown
}

export interface Router {
  current(): RouteMatch | null
  navigate(name: RouteName, params?: Readonly<Record<string, string>>): void
  subscribe(listener: (match: RouteMatch | null) => void): () => void
  /** 浮层（任务/worker/阅读器等）不走路由：入栈/弹栈通知。 */
  openOverlay(id: string, element: unknown): void
  closeOverlay(id: string): void
  overlays(): readonly Overlay[]
  subscribeOverlays(listener: (overlays: readonly Overlay[]) => void): () => void
  dispose(): void
}

export function createRouter(hashSource: HashSource): Router {
  const listeners = new Set<(match: RouteMatch | null) => void>()
  const overlayListeners = new Set<(overlays: readonly Overlay[]) => void>()
  const overlayStack: Overlay[] = []
  let currentMatch = matchHash(hashSource.get())

  const emit = (): void => {
    currentMatch = matchHash(hashSource.get())
    for (const listener of listeners) listener(currentMatch)
  }
  const unsubscribeHash = hashSource.subscribe(emit)
  const emitOverlays = (): void => {
    for (const listener of overlayListeners) listener([...overlayStack])
  }

  const buildHash = (name: RouteName, params: Readonly<Record<string, string>>): string => {
    const pattern = PATTERNS.find(([routeName]) => routeName === name)?.[1]
    if (pattern === undefined) return '#/'
    return pattern
      .split('/')
      .map((part) => (part.startsWith(':') ? encodeURIComponent(params[part.slice(1)] ?? '') : part))
      .join('/')
  }

  return {
    current: () => currentMatch,
    navigate(name, params = {}) {
      hashSource.set(buildHash(name, params))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    openOverlay(id, element) {
      const existing = overlayStack.findIndex((overlay) => overlay.id === id)
      if (existing !== -1) overlayStack.splice(existing, 1)
      overlayStack.push({ id, element })
      emitOverlays()
    },
    closeOverlay(id) {
      const index = overlayStack.findIndex((overlay) => overlay.id === id)
      if (index !== -1) overlayStack.splice(index, 1)
      emitOverlays()
    },
    overlays: () => [...overlayStack],
    subscribeOverlays(listener) {
      overlayListeners.add(listener)
      return () => overlayListeners.delete(listener)
    },
    dispose() {
      unsubscribeHash()
      listeners.clear()
      overlayListeners.clear()
    },
  }
}

/** window hash 源（装配用）。 */
export function windowHashSource(): HashSource {
  const listeners = new Set<() => void>()
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      for (const listener of listeners) listener()
    })
  }
  return {
    get: () => (typeof window === 'undefined' ? '' : window.location.hash),
    set: (hash) => {
      if (typeof window !== 'undefined') window.location.hash = hash
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
