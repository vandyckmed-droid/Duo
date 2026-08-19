import { describe, expect, it } from 'vitest'
import {
  type KeyValueStorage,
  readSelection,
  toggleSelection,
  writeSelection,
} from './selection.ts'

/** An in-memory stand-in for `localStorage`, plus optional failure modes. */
function fakeStorage(options?: {
  readonly initial?: Readonly<Record<string, string>>
  readonly throwOnGet?: boolean
  readonly throwOnSet?: boolean
}): KeyValueStorage {
  const data = new Map(Object.entries(options?.initial ?? {}))
  return {
    getItem: (key) => {
      if (options?.throwOnGet) throw new Error('storage unavailable')
      return data.get(key) ?? null
    },
    setItem: (key, value) => {
      if (options?.throwOnSet) throw new Error('quota exceeded')
      data.set(key, value)
    },
  }
}

describe('readSelection', () => {
  it('returns an empty set when nothing is stored', () => {
    expect(readSelection(fakeStorage())).toEqual(new Set())
  })

  it('reads back a previously written selection', () => {
    const storage = fakeStorage({
      initial: { 'duo:selection': '["AAPL","MSFT"]' },
    })
    expect(readSelection(storage)).toEqual(new Set(['AAPL', 'MSFT']))
  })

  it.each([
    ['malformed JSON', '{not json'],
    ['a JSON object instead of an array', '{"AAPL":true}'],
    ['an array of non-strings', '[1, 2, 3]'],
    ['an empty string', ''],
  ])('falls back to empty for %s', (_label, raw) => {
    const storage = fakeStorage({ initial: { 'duo:selection': raw } })
    expect(readSelection(storage)).toEqual(new Set())
  })

  it('drops non-string entries but keeps the valid ones', () => {
    const storage = fakeStorage({
      initial: { 'duo:selection': '["AAPL", 42, "MSFT", null]' },
    })
    expect(readSelection(storage)).toEqual(new Set(['AAPL', 'MSFT']))
  })

  it('returns empty rather than throwing when storage access fails', () => {
    expect(readSelection(fakeStorage({ throwOnGet: true }))).toEqual(new Set())
  })
})

describe('writeSelection', () => {
  it('persists the selection as a JSON array', () => {
    const storage = fakeStorage()
    writeSelection(storage, new Set(['AAPL', 'MSFT']))
    expect(readSelection(storage)).toEqual(new Set(['AAPL', 'MSFT']))
  })

  it('does not throw when storage access fails', () => {
    const storage = fakeStorage({ throwOnSet: true })
    expect(() => writeSelection(storage, new Set(['AAPL']))).not.toThrow()
  })
})

describe('toggleSelection', () => {
  it('adds a ticker that is not selected', () => {
    expect(toggleSelection(new Set(['AAPL']), 'MSFT')).toEqual(
      new Set(['AAPL', 'MSFT']),
    )
  })

  it('removes a ticker that is already selected', () => {
    expect(toggleSelection(new Set(['AAPL', 'MSFT']), 'AAPL')).toEqual(
      new Set(['MSFT']),
    )
  })

  it('does not mutate the set it was given', () => {
    const original = new Set(['AAPL'])
    toggleSelection(original, 'MSFT')
    expect(original).toEqual(new Set(['AAPL']))
  })
})
