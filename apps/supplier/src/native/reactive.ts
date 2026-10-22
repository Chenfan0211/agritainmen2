export interface ValueRef<T> { value: T }

interface WatchEntry<T = unknown> {
  getter: () => T
  callback: (next: T, previous: T | undefined) => void
  initialized: boolean
  previous: T | undefined
}

type RootEntry =
  | { kind: 'ref'; value: ValueRef<unknown> }
  | { kind: 'reactive'; value: Record<string, unknown> }

const refs = new Map<string, ValueRef<any>>()
const reactives = new Map<string, Record<string, any>>()
const watchers: WatchEntry<any>[] = []
const mountedCallbacks: Array<() => void> = []
const unmountedCallbacks: Array<() => void> = []

export function ref<T>(name: string, value: T): ValueRef<T> {
  const target: ValueRef<T> = { value }
  refs.set(name, target)
  return target
}

export function computed<T>(name: string, getter: () => T): ValueRef<T> {
  const target = { get value() { return getter() } } as ValueRef<T>
  refs.set(name, target)
  return target
}

export function reactive<T extends Record<string, any>>(name: string, value: T): T {
  reactives.set(name, value)
  return value
}

export function watch<T>(getter: () => T, callback: (next: T, previous: T | undefined) => void): void {
  watchers.push({ getter, callback, initialized: false, previous: undefined })
}

export function onMounted(callback: () => void): void {
  mountedCallbacks.push(callback)
}

export function onBeforeUnmount(callback: () => void): void {
  unmountedCallbacks.push(callback)
}

export function runWatchers(): void {
  for (const entry of watchers) {
    const next = entry.getter()
    if (!entry.initialized || JSON.stringify(next) !== JSON.stringify(entry.previous)) {
      const previous = entry.previous
      entry.initialized = true
      entry.previous = next
      entry.callback(next, previous)
    }
  }
}

export function runMountedCallbacks(): void {
  for (const callback of mountedCallbacks) callback()
}

export function runUnmountedCallbacks(): void {
  for (const callback of unmountedCallbacks) callback()
}

export function cloneForView<T>(value: T): any {
  if (value === undefined) return null
  if (value === null) return null
  if (value instanceof Set) return Array.from(value).map((item) => cloneForView(item))
  if (Array.isArray(value)) return value.map((item) => cloneForView(item))
  if (typeof value === 'function') return undefined
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const cloned = cloneForView(item)
      if (cloned !== undefined) output[key] = cloned
    }
    return output
  }
  return value
}

export function snapshotRoots(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [name, target] of refs) output[name] = cloneForView(target.value)
  for (const [name, target] of reactives) output[name] = cloneForView(target)
  for (const [name, value] of Object.entries(extra)) output[name] = cloneForView(value)
  return output
}

function rootEntry(name: string): RootEntry | undefined {
  const refTarget = refs.get(name)
  if (refTarget) return { kind: 'ref', value: refTarget }
  const reactiveTarget = reactives.get(name)
  if (reactiveTarget) return { kind: 'reactive', value: reactiveTarget }
  return undefined
}

export function getRootValue(name: string): unknown {
  const entry = rootEntry(name)
  return entry ? entry.value : undefined
}

export function getRootValuePath(path: string): unknown {
  const parts = path.split('.').filter(Boolean)
  if (!parts.length) return undefined
  const entry = rootEntry(parts[0])
  if (!entry) return undefined
  let target: any = entry.kind === 'ref' ? (entry.value as ValueRef<any>).value : entry.value
  for (let index = 1; index < parts.length; index += 1) {
    if (target === null || target === undefined) return undefined
    target = target[parts[index]]
  }
  return target
}
export function setRootPath(path: string, value: unknown): void {
  const parts = path.split('.').filter(Boolean)
  if (!parts.length) return
  const entry = rootEntry(parts[0])
  if (!entry) return
  if (parts.length === 1) {
    if (entry.kind === 'ref') (entry.value as ValueRef<unknown>).value = value
    else (entry.value as Record<string, unknown>)[parts[0]] = value
    return
  }
  let target: any = entry.kind === 'ref' ? (entry.value as ValueRef<any>).value : entry.value
  for (let index = 1; index < parts.length - 1; index += 1) {
    if (!target || typeof target !== 'object') return
    target = target[parts[index]]
  }
  if (!target || typeof target !== 'object') return
  target[parts[parts.length - 1]] = value
}
