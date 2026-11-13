import { describe, expect, it } from 'vitest'
import { readMiniProgramRuntimeConfig } from './runtime-config'

describe('mini program runtime config', () => {
  it('falls back to mock mode when build defines are absent', () => {
    expect(readMiniProgramRuntimeConfig()).toEqual({ apiBaseUrl: '', dataMode: 'mock', appId: '' })
  })
})
