import { describe, expect, it, vi } from 'vitest'

import { createSharedRefreshRunner } from '../../../src/pages/index/shared-refresh'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('supplier shared refresh runner', () => {
  it('replays one dirty refresh after the current refresh settles without running concurrently', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    let active = 0
    let maximumActive = 0
    const refresh = vi.fn()
      .mockImplementationOnce(async () => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await first.promise
        active -= 1
      })
      .mockImplementationOnce(async () => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await second.promise
        active -= 1
      })
    const run = createSharedRefreshRunner(refresh, vi.fn())

    run()
    run()
    await Promise.resolve()
    expect(refresh).toHaveBeenCalledTimes(1)

    run()
    run()
    await Promise.resolve()
    expect(refresh).toHaveBeenCalledTimes(1)

    first.resolve()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    expect(maximumActive).toBe(1)

    second.resolve()
    await second.promise
  })

  it('reports a rejected refresh and remains able to process a dirty replay', async () => {
    const failure = new Error('refresh failed')
    const replay = deferred<void>()
    const refresh = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(() => replay.promise)
    const onError = vi.fn()
    const run = createSharedRefreshRunner(refresh, onError)

    run()
    await Promise.resolve()
    run()

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))

    replay.resolve()
    await replay.promise
  })
})
