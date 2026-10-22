import { describe, expect, it } from 'vitest'
import { configureMediaRuntime, getMediaRuntime, isMediaRuntimeConfigured, type MediaRuntime } from './runtime'
import { createH5MediaRuntime } from './h5-runtime'

describe('media runtime registry', () => {
  it('exposes the H5 runtime factory for the admin workspace', () => {
    expect(typeof createH5MediaRuntime).toBe('function')
  })
  it('stores the configured runtime on a global keyed registry', () => {
    const runtime = { storage: {} as MediaRuntime['storage'], chooseImages: async () => [], fallback: { source: 'builtin', path: '/fallback' } } satisfies MediaRuntime
    configureMediaRuntime(runtime)
    expect(getMediaRuntime()).toBe(runtime)
    expect(isMediaRuntimeConfigured()).toBe(true)
    expect(Symbol.for('agritainment.ui.mediaRuntime')).toBeDefined()
  })
})
