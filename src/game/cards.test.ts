import { describe, expect, test } from 'vitest'
import {
  buildStarter,
  canRun,
  OFF_FORMATIONS,
  OFF_PLAYS,
  personnelOf,
  STARTERS,
  starterDeck,
  type Card,
  type StyleName,
} from './cards'
import { makeRng } from './rng'

const STYLES = Object.keys(STARTERS) as StyleName[]

/** A card's identity ignoring which copy it is, for comparing decks. */
const signature = (c: Card) => (c.type === 'play' ? c.play : `adj:${c.name}`)

/** Multiset intersection: what every one of these lists holds in common. */
function sharedAcross(lists: string[][]): string[] {
  return lists.reduce((common, list) => {
    const pool = [...list]
    return common.filter((entry) => {
      const i = pool.indexOf(entry)
      if (i === -1) return false
      pool.splice(i, 1)
      return true
    })
  })
}

const core = () => sharedAcross(STYLES.map((s) => starterDeck(s).map(signature)))

describe('starter decks', () => {
  test.each(STYLES)('%s starts with exactly 16 cards', (style) => {
    expect(starterDeck(style)).toHaveLength(16)
  })

  /**
   * The shared core is deliberately small. A one-drive encounter deals you six
   * cards, so a large core means all three styles play the same game — measured
   * at nine shared plays, the identities were four cards out of sixteen and a
   * style's finisher almost never appeared in hand.
   */
  test('the deck is more its own than shared', () => {
    // 9 in common of 16 was measured as too much: with a six-card hand in a
    // one-drive encounter every style drew the same game and its finisher
    // almost never appeared. Six plays and the three adjustments is the floor
    // that keeps a style recognisable.
    const shared = core().length
    expect(shared).toBeLessThanOrEqual(9)
    expect(starterDeck('Air Raid').length - shared).toBeGreaterThanOrEqual(7)
  })

  test('the three adjustments are common to everyone', () => {
    expect(core().filter((s) => s.startsWith('adj:'))).toHaveLength(3)
  })

  test('Hot Read is earned, not issued', () => {
    // It never lies, so it belongs in the draft pool rather than the starter.
    expect(core()).not.toContain('adj:Hot Read')
  })

  test.each(STYLES)('%s can field all three personnel groups', (style) => {
    // The declaration is the core decision; a style whose plays cannot be run
    // out of some group would silently delete that group.
    const groups = new Set(
      (Object.keys(OFF_FORMATIONS) as (keyof typeof OFF_FORMATIONS)[])
        .filter((form) =>
          starterDeck(style).some((c) => c.type === 'play' && canRun(form, c.play)),
        )
        .map((form) => personnelOf(form)),
    )
    expect(groups.size).toBe(3)
  })

  test('the three styles really are different decks', () => {
    const sigs = STYLES.map((s) => starterDeck(s).map(signature).sort().join('|'))
    expect(new Set(sigs).size).toBe(3)
  })

  test.each(STYLES)('%s only references real formations and plays', (style) => {
    for (const card of starterDeck(style)) {
      if (card.type !== 'play') continue
      expect(OFF_PLAYS[card.play]).toBeDefined()
    }
  })

  test.each(STYLES)('%s gives every card a unique id', (style) => {
    const deck = starterDeck(style)
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length)
  })

  test('shuffles deterministically for a given seed', () => {
    expect(buildStarter('Air Raid', makeRng(99))).toEqual(buildStarter('Air Raid', makeRng(99)))
  })

  test('shuffles differently for different seeds', () => {
    expect(buildStarter('Air Raid', makeRng(1))).not.toEqual(buildStarter('Air Raid', makeRng(2)))
  })
})

describe('formation locks', () => {
  test.each(STYLES)('%s can line up everything it carries somewhere', (style) => {
    // A card no formation can run would be a permanent dead draw.
    const forms = Object.keys(OFF_FORMATIONS) as (keyof typeof OFF_FORMATIONS)[]
    for (const card of starterDeck(style)) {
      if (card.type !== 'play') continue
      expect(forms.some((f) => canRun(f, card.play))).toBe(true)
    }
  })

  test('the locks actually restrict something', () => {
    // A lock nothing uses is decoration. Four Verticals needs a spread set.
    expect(canRun('Gun 11', 'Four Verticals')).toBe(true)
    expect(canRun('I-Form', 'Four Verticals')).toBe(false)
    expect(canRun('I-Form', 'Power O')).toBe(true)
    expect(canRun('Gun 11', 'Power O')).toBe(false)
  })

  test('the quick game runs from anywhere', () => {
    // The man/zone pair has to be reachable by every style, or the read is
    // only useful to some decks.
    for (const form of Object.keys(OFF_FORMATIONS) as (keyof typeof OFF_FORMATIONS)[]) {
      expect(canRun(form, 'Slant')).toBe(true)
      expect(canRun(form, 'Stick')).toBe(true)
    }
  })
})

describe('the man/zone grid', () => {
  const passes = Object.entries(OFF_PLAYS).filter(([, p]) => p.kind === 'pass')

  test('every depth has both a man beater and a zone beater', () => {
    for (const depth of [1, 2, 3]) {
      const atDepth = passes.filter(([, p]) => p.kind === 'pass' && p.depth === depth)
      expect(atDepth.some(([, p]) => p.kind === 'pass' && p.vsMan >= 2)).toBe(true)
      expect(atDepth.some(([, p]) => p.kind === 'pass' && p.vsMan <= -2)).toBe(true)
    }
  })

  test('runs split into numbers plays and misdirection', () => {
    const runs = Object.values(OFF_PLAYS).filter((p) => p.kind === 'run')
    expect(runs.some((p) => p.kind === 'run' && p.vsBox === -1)).toBe(true)
    expect(runs.some((p) => p.kind === 'run' && p.vsBox === 1)).toBe(true)
  })
})
