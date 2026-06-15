/**
 * EN ↔ AR key parity: a PR that adds an English key without its Arabic mirror
 * (or vice versa) fails here instead of shipping a raw key to users.
 */
import { describe, expect, it } from 'vitest'
import enCommon from './en/common.json'
import enOnline from './en/online.json'
import enSnakes from './en/snakes.json'
import enLudo from './en/ludo.json'
import enFour from './en/four.json'
import enUno from './en/uno.json'
import enBank from './en/bank.json'
import enXO from './en/xo.json'
import enChess from './en/chess.json'
import arCommon from './ar/common.json'
import arOnline from './ar/online.json'
import arSnakes from './ar/snakes.json'
import arLudo from './ar/ludo.json'
import arFour from './ar/four.json'
import arUno from './ar/uno.json'
import arBank from './ar/bank.json'
import arXO from './ar/xo.json'
import arChess from './ar/chess.json'

const allKeys = (obj: unknown, prefix = ''): string[] =>
  Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? allKeys(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )

// Plural categories legitimately differ (Arabic has six, English two).
const strip = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '')

const NAMESPACES: Array<[string, unknown, unknown]> = [
  ['common', enCommon, arCommon],
  ['online', enOnline, arOnline],
  ['snakes', enSnakes, arSnakes],
  ['ludo', enLudo, arLudo],
  ['four', enFour, arFour],
  ['uno', enUno, arUno],
  ['bank', enBank, arBank],
  ['xo', enXO, arXO],
  ['chess', enChess, arChess],
]

describe('locale key parity (en ↔ ar)', () => {
  it.each(NAMESPACES)('%s.json has mirrored keys', (_ns, en, ar) => {
    const enKeys = new Set(allKeys(en).map(strip))
    const arKeys = new Set(allKeys(ar).map(strip))
    expect([...enKeys].filter((k) => !arKeys.has(k))).toEqual([])
    expect([...arKeys].filter((k) => !enKeys.has(k))).toEqual([])
  })
})
