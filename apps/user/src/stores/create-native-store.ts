// 原生小程序 store：替代 pinia 的最小子集（state / getters / actions / $patch / $state / $subscribe）。
// getters 采用惰性求值（每次读取重新计算），与原来依赖 distributorTick 失效信号的行为等价。
import { migratePersistedState, persistedEnvelope } from '@agritainment/shared'

export interface NativeStorePersistence {
  storageKey: string
  keys: readonly string[]
}

export interface NativeStoreOptions<S extends object> {
  state: () => S
  getters: Record<string, (this: any, state: any) => unknown>
  actions: Record<string, (this: any, ...args: any[]) => unknown>
  persistence?: NativeStorePersistence
}

export type NativeStore<S extends object> = S & Record<string, any>

function hasWxStorage(): boolean {
  return typeof wx !== 'undefined' && !!wx && typeof wx.getStorageSync === 'function' && typeof wx.setStorageSync === 'function'
}

export function createNativeStore<S extends object>(id: string, options: NativeStoreOptions<S>): NativeStore<S> {
  const initialState = options.state()
  const stateKeys = Object.keys(initialState) as Array<keyof S & string>
  const listeners = new Set<() => void>()
  let suspended = false
  // store 以 any 组装（state/getters/actions 动态挂载），对外仍是 NativeStore<S>。
  const store: any = {}

  const notify = (): void => {
    if (suspended) return
    persist()
    listeners.forEach((listener) => {
      try {
        listener()
      } catch {
        // 单个订阅者失败不能影响其他页面刷新。
      }
    })
  }

  const persist = (): void => {
    const persistence = options.persistence
    if (!persistence || !hasWxStorage()) return
    try {
      wx.setStorageSync(persistence.storageKey, persistedEnvelope(pickState(), persistence.keys))
    } catch {
      // 存储写入失败不能阻断业务动作。
    }
  }

  const pickState = (): Record<string, unknown> => {
    const snapshot: Record<string, unknown> = {}
    stateKeys.forEach((key) => { snapshot[key] = store[key] })
    return snapshot
  }

  stateKeys.forEach((key) => {
    let value = (initialState as Record<string, unknown>)[key as string]
    Object.defineProperty(store, key, {
      enumerable: true,
      configurable: true,
      get: () => value,
      set: (next: unknown) => {
        value = next
        notify()
      }
    })
  })

  Object.entries(options.getters).forEach(([key, getter]) => {
    Object.defineProperty(store, key, {
      enumerable: true,
      configurable: true,
      get: () => getter.call(store, store)
    })
  })

  Object.entries(options.actions).forEach(([key, action]) => {
    Object.defineProperty(store, key, {
      enumerable: false,
      configurable: true,
      value: (...args: unknown[]) => {
        let result: unknown
        try {
          result = action.apply(store, args)
        } catch (error) {
          notify()
          throw error
        }
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>).then(
            (settled) => { notify(); return settled },
            (error) => { notify(); throw error }
          )
        }
        notify()
        return result
      }
    })
  })

  Object.defineProperty(store, '$id', { enumerable: false, configurable: false, value: id })
  Object.defineProperty(store, '$state', { enumerable: false, configurable: false, get: pickState })
  Object.defineProperty(store, '$patch', {
    enumerable: false,
    configurable: false,
    value: (partial: Record<string, unknown>) => {
      if (!partial || typeof partial !== 'object') return
      Object.keys(partial).forEach((key) => { store[key] = partial[key] })
    }
  })
  Object.defineProperty(store, '$reset', {
    enumerable: false,
    configurable: false,
    value: () => {
      const fresh = options.state() as Record<string, unknown>
      stateKeys.forEach((key) => { store[key] = fresh[key] })
    }
  })
  Object.defineProperty(store, '$subscribe', {
    enumerable: false,
    configurable: false,
    value: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
  })

  const persistence = options.persistence
  if (persistence && hasWxStorage()) {
    try {
      const saved = wx.getStorageSync(persistence.storageKey)
      if (saved) {
        suspended = true
        store.$patch(migratePersistedState(saved, store.$state) as Record<string, unknown>)
      }
    } catch {
      // 读取失败时以初始状态启动。
    } finally {
      suspended = false
    }
  }

  return store
}