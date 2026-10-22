type AnyAction = (...args: any[]) => any
type GetterMap<S extends object> = Record<string, (state: S) => unknown>

type GetterValues<G extends GetterMap<S>, S extends object> = {
  [K in keyof G]: ReturnType<G[K]>
}

export interface NativeStoreApi<S extends object> {
  readonly $id: string
  readonly $state: S
  $patch(partial: Partial<S>): void
  $subscribe(callback: (state: S) => void): () => void
}

export type NativeStore<S extends object, G extends GetterMap<S>, A extends Record<string, AnyAction>> =
  S & GetterValues<G, S> & A & NativeStoreApi<S>

export interface NativeStoreOptions<S extends object, G extends GetterMap<S>, A extends Record<string, AnyAction>> {
  state: () => S
  getters?: G
  actions?: A & ThisType<NativeStore<S, G, A>>
}

export type NativeStoreFactory<S extends object, G extends GetterMap<S>, A extends Record<string, AnyAction>> =
  (() => NativeStore<S, G, A>) & { reset(): void }

/** 轻量原生 store：保留 state/getters/actions/$patch/$subscribe，不依赖 Vue/Pinia。 */
export function defineStore<S extends object, G extends GetterMap<S>, A extends Record<string, AnyAction>>(
  id: string,
  options: NativeStoreOptions<S, G, A>
): NativeStoreFactory<S, G, A> {
  let instance: NativeStore<S, G, A> | null = null

  const factory = (() => {
    if (instance) return instance

    const raw = options.state()
    const listeners = new Set<(state: S) => void>()
    let notifyTimer: ReturnType<typeof setTimeout> | null = null
    let proxy: NativeStore<S, G, A>

    const notify = () => {
      if (notifyTimer) return
      notifyTimer = setTimeout(() => {
        notifyTimer = null
        for (const listener of listeners) listener(proxy as unknown as S)
      }, 0)
    }

    proxy = new Proxy(raw as object, {
      get(target, property, receiver) {
        return Reflect.get(target, property, receiver)
      },
      set(target, property, value, receiver) {
        const previous = Reflect.get(target, property, receiver)
        const changed = previous !== value
        const ok = Reflect.set(target, property, value, receiver)
        if (ok && changed) notify()
        return ok
      }
    }) as NativeStore<S, G, A>

    if (options.getters) {
      for (const [key, getter] of Object.entries(options.getters)) {
        Object.defineProperty(raw, key, {
          enumerable: false,
          configurable: false,
          get: () => getter(proxy as unknown as S)
        })
      }
    }

    Object.defineProperties(raw, {
      $id: { enumerable: false, configurable: false, value: id },
      $state: { enumerable: false, configurable: false, get: () => proxy },
      $patch: {
        enumerable: false,
        configurable: false,
        value: (partial: Partial<S>) => {
          Object.assign(raw, partial)
          notify()
        }
      },
      $subscribe: {
        enumerable: false,
        configurable: false,
        value: (callback: (state: S) => void) => {
          listeners.add(callback)
          return () => listeners.delete(callback)
        }
      }
    })

    if (options.actions) {
      for (const [key, action] of Object.entries(options.actions)) {
        if (key in raw) throw new Error(`原生 store action 与 state/getter 重名: ${key}`)
        Object.defineProperty(raw, key, {
          enumerable: false,
          configurable: false,
          value: (...args: unknown[]) => {
            const result = action.apply(proxy, args)
            if (result && typeof result.then === 'function') {
              return result.then((value: unknown) => {
                notify()
                return value
              }, (error: unknown) => {
                notify()
                throw error
              })
            }
            notify()
            return result
          }
        })
      }
    }

    instance = proxy
    return instance
  }) as NativeStoreFactory<S, G, A>

  factory.reset = () => { instance = null }
  return factory
}
