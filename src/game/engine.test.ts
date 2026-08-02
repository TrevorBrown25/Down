import { describe, expect, test } from 'vitest'
import { makeRng } from './rng'
import { OFF_PLAYS, personnelOf } from './cards'
import {
  armChip,
  callPlay,
  challenge,
  declarePersonnel,
  hurryUp,
  newGame,
  nextDown,
  legalPlays,
  playAudible,
  playInfoCard,
  punt,
  toss,
  type Game,
} from './engine'
import { COVERAGES } from './cards'

const start = (over: Partial<Parameters<typeof newGame>[0]> = {}) =>
  newGame({ seed: 1, archetype: 'Ground & Pound', opponentName: 'The Gamblers', ...over })

/** Force a snap outcome so advancement can be tested without fighting the dice. */
const withOutcome = (game: Game, yards: number, turnover = false): Game => ({
  ...game,
  phase: 'result',
  lastSnap: {
    result: { yards, event: 'run', ...(turnover ? { turnover: true } : {}) },
    fired: [],
    chargeUsed: 0,
  },
})

describe('newGame', () => {
  test('deals a full hand', () => {
    expect(start().hand).toHaveLength(6)
  })

  test('is fully determined by its seed', () => {
    expect(start({ seed: 77 })).toEqual(start({ seed: 77 }))
  })

  test('starts on 1st and 10 at the 25', () => {
    const g = start()
    expect([g.down, g.toGo, g.ballOn]).toEqual([1, 10, 25])
  })
})

describe('down and distance', () => {
  test('gaining the sticks resets to 1st and 10 and pays a chip', () => {
    const g = start()
    const before = g.chips
    const next = nextDown(withOutcome({ ...g, down: 2, toGo: 7, ballOn: 40 }, 8), makeRng(2))
    expect([next.down, next.toGo, next.ballOn]).toEqual([1, 10, 48])
    expect(next.chips).toBe(before + 1)
  })

  test('coming up short advances the down and shortens the distance', () => {
    const next = nextDown(withOutcome({ ...start(), down: 1, toGo: 10, ballOn: 40 }, 4), makeRng(2))
    expect([next.down, next.toGo, next.ballOn]).toEqual([2, 6, 44])
  })

  test('failing on 4th down ends the drive', () => {
    const g = { ...start(), down: 4, toGo: 5, ballOn: 40 }
    const next = nextDown(withOutcome(g, 2), makeRng(2))
    expect(next.possessionsUsed).toBe(g.possessionsUsed + 1)
    expect(next.ballOn).toBe(25)
    expect(next.down).toBe(1)
  })
})

describe('scoring', () => {
  test('crossing the goal line is worth 7 and ends the drive', () => {
    const g = { ...start(), ballOn: 95, down: 1, toGo: 5 }
    const next = nextDown(withOutcome(g, 10), makeRng(2))
    expect(next.points).toBe(7)
    expect(next.possessionsUsed).toBe(1)
  })

  test('a turnover ends the drive with nothing', () => {
    const g = { ...start(), ballOn: 60 }
    const next = nextDown(withOutcome(g, 0, true), makeRng(2))
    expect(next.points).toBe(0)
    expect(next.possessionsUsed).toBe(1)
  })

  test('hitting the target ends the game as a win', () => {
    const g = { ...start(), ballOn: 95, points: 14, possessionsUsed: 1 }
    const next = nextDown(withOutcome(g, 10), makeRng(2))
    expect(next.phase).toBe('over')
    expect(next.won).toBe(true)
  })

  test('running out of possessions ends the game as a loss', () => {
    const g = { ...start(), possessionsUsed: 4, down: 4, toGo: 20, ballOn: 30 }
    const next = nextDown(withOutcome(g, 1), makeRng(2))
    expect(next.phase).toBe('over')
    expect(next.won).toBe(false)
  })
})

describe('the ◆ charge', () => {
  test('builds on runs and stops at 4', () => {
    const dealt = { ...start(), charge: 3 }
    const run = dealt.hand.find((c) => c.type === 'play' && OFF_PLAYS[c.play].kind === 'run')
    if (!run || run.type !== 'play') throw new Error('expected a run in the opening hand')
    const g = declarePersonnel(dealt, personnelOf(run.form), makeRng(5))
    expect(callPlay(g, run.id, makeRng(5)).charge).toBe(4)
  })

  test('is spent, not banked, by play action', () => {
    const dealt = { ...start({ archetype: 'Pro Style' }), charge: 3 }
    const pa = dealt.hand.find((c) => c.type === 'play' && c.play === 'Play Action')
    if (!pa || pa.type !== 'play') return // not in this deal; covered by snap tests
    const g = declarePersonnel(dealt, personnelOf(pa.form), makeRng(5))
    expect(callPlay(g, pa.id, makeRng(5)).charge).toBe(0)
  })
})

describe('possession changes', () => {
  test('a punt burns a possession and hands over better field position', () => {
    const g = { ...start(), ballOn: 55, down: 4, toGo: 8 }
    const next = punt(g, makeRng(3))
    expect(next.possessionsUsed).toBe(1)
    expect(next.ballOn).toBeGreaterThan(25)
    expect(next.down).toBe(1)
    expect(next.charge).toBe(0)
  })
})

describe('defensive play-calling', () => {
  // Regression for the prototype bug: the defense picked its coverage from the
  // down that had just finished, because declarePersonnel read a stale closure.
  // The Gamblers always blitz on 3rd down, so a converted 3rd down used to carry
  // the blitz into the following 1st down every single time.
  test('reads the down about to be played, not the one just finished', () => {
    const coverages = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const g = { ...start({ seed }), down: 3, toGo: 3, ballOn: 40 }
      const next = nextDown(withOutcome(g, 9), makeRng(seed))
      expect(next.down).toBe(1)
      const declared =
        next.phase === 'call' ? next : declarePersonnel(next, next.groupsInHand[0], makeRng(seed))
      coverages.add(declared.defCov ?? 'none')
    }
    // With the bug this set is exactly {'Cover 1 Blitz'} on every seed.
    expect(coverages.size).toBeGreaterThan(1)
  })

  test('still blitzes when it actually is 3rd down', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = { ...start({ seed }), down: 2, toGo: 8, ballOn: 40 }
      const next = nextDown(withOutcome(g, 1), makeRng(seed))
      expect(next.down).toBe(3)
      const declared =
        next.phase === 'call' ? next : declarePersonnel(next, next.groupsInHand[0], makeRng(seed))
      expect(declared.defCov).toBe('Cover 1 Blitz')
    }
  })
})

/** A game sitting at the call, with the defense already showing a look. */
const called = (over: Partial<Parameters<typeof newGame>[0]> = {}): Game => {
  const g = start(over)
  return g.phase === 'call' ? g : declarePersonnel(g, g.groupsInHand[0], makeRng(1))
}

const adjCard = (g: Game, name: string) =>
  g.hand.find((c) => c.type === 'adj' && c.name === name)

describe('toss', () => {
  test('swaps a card without changing the hand size', () => {
    const g = called()
    const victim = g.hand[0]
    const after = toss(g, victim.id, makeRng(3))
    expect(after.hand).toHaveLength(g.hand.length)
    expect(after.hand.map((c) => c.id)).not.toContain(victim.id)
    expect(after.discard.map((c) => c.id)).toContain(victim.id)
    expect(after.tossUsed).toBe(true)
  })

  test('is once per down', () => {
    const g = toss(called(), called().hand[0].id, makeRng(3))
    expect(toss(g, g.hand[0].id, makeRng(3))).toBe(g)
  })

  test('refuses to throw away the last legal play', () => {
    // The prototype allowed this and soft-locked the down: no play to call, no
    // toss left to fix it, and no button but the clock.
    const g = called()
    const only = legalPlays(g)[0]
    const trimmed: Game = { ...g, hand: [only, ...g.hand.filter((c) => c.type === 'adj')] }
    expect(toss(trimmed, only.id, makeRng(3))).toBe(trimmed)
  })
})

describe('hurry-up', () => {
  test('buys a card for a chip', () => {
    const g = called()
    const after = hurryUp(g, makeRng(3))
    expect(after.hand).toHaveLength(g.hand.length + 1)
    expect(after.chips).toBe(g.chips - 1)
  })

  test('is refused with no chips', () => {
    const g: Game = { ...called(), chips: 0 }
    expect(hurryUp(g, makeRng(3))).toBe(g)
  })

  test('does not charge for a card it cannot deal', () => {
    const g: Game = { ...called(), deck: [], discard: [] }
    expect(hurryUp(g, makeRng(3))).toBe(g)
  })
})

describe('Motion', () => {
  const withMotion = (seed: number): Game => {
    const g = called({ seed })
    const motion = adjCard(g, 'Motion')
    return motion ? g : { ...g, hand: [...g.hand, { id: 999, type: 'adj', name: 'Motion' }] }
  }

  test('reads man or zone and spends the card', () => {
    const g = withMotion(1)
    const card = adjCard(g, 'Motion')
    if (!card) throw new Error('expected a Motion card')
    const after = playInfoCard(g, card.id, makeRng(1))
    expect(['man', 'zone']).toContain(after.known)
    expect(after.hand.map((c) => c.id)).not.toContain(card.id)
    expect(after.discard.map((c) => c.id)).toContain(card.id)
  })

  test('sometimes lies, and the lie is the opposite of the truth', () => {
    let lies = 0
    let truths = 0
    for (let seed = 1; seed <= 200; seed++) {
      const g = withMotion(seed)
      const card = adjCard(g, 'Motion')
      if (!card || !g.defCov) continue
      const truth = COVERAGES[g.defCov].man ? 'man' : 'zone'
      const after = playInfoCard(g, card.id, makeRng(seed))
      if (after.disguised) {
        lies++
        expect(after.known).not.toBe(truth)
      } else {
        truths++
        expect(after.known).toBe(truth)
      }
    }
    expect(lies).toBeGreaterThan(0)
    expect(truths).toBeGreaterThan(lies)
  })
})

describe('Hot Read', () => {
  test('names the exact coverage and never lies', () => {
    const base = called()
    const g: Game = { ...base, hand: [...base.hand, { id: 998, type: 'adj', name: 'Hot Read' }] }
    const after = playInfoCard(g, 998, makeRng(1))
    expect(after.known).toBe(g.defCov)
    expect(after.disguised).toBe(false)
  })

  test('only one read per down', () => {
    const base = called()
    const g: Game = {
      ...base,
      hand: [
        ...base.hand,
        { id: 998, type: 'adj', name: 'Hot Read' },
        { id: 997, type: 'adj', name: 'Motion' },
      ],
    }
    const after = playInfoCard(g, 998, makeRng(1))
    expect(playInfoCard(after, 997, makeRng(1))).toBe(after)
  })
})

describe('arming chips', () => {
  test('toggles on and back off', () => {
    const g = called()
    expect(armChip(g, 'protect').protectArmed).toBe(true)
    expect(armChip(armChip(g, 'protect'), 'protect').protectArmed).toBe(false)
  })

  test('refuses what the chip stack cannot cover', () => {
    // Send It and Fresh Legs are 2 each; with 3 chips only one can be armed.
    const g: Game = { ...called(), chips: 3 }
    const armed = armChip(g, 'juice')
    expect(armed.juiceArmed).toBe(true)
    expect(armChip(armed, 'fresh')).toBe(armed)
  })

  test('actually spends what was armed', () => {
    const g: Game = { ...called(), chips: 5 }
    const armed = armChip(armChip(g, 'protect'), 'juice')
    const play = legalPlays(armed)[0]
    expect(callPlay(armed, play.id, makeRng(2)).chips).toBe(2)
  })

  test('Quick Count needs the card in hand', () => {
    const base = called()
    const stripped: Game = {
      ...base,
      hand: base.hand.filter((c) => c.type !== 'adj' || c.name !== 'Quick Count'),
    }
    expect(armChip(stripped, 'quick')).toBe(stripped)
  })
})

describe('challenge', () => {
  const afterSnap = (seed: number): Game => {
    const g = called({ seed })
    return callPlay(g, legalPlays(g)[0].id, makeRng(seed))
  }

  test('re-rolls the snap and is spent', () => {
    const g = afterSnap(1)
    const after = challenge(g, makeRng(50))
    expect(after.challengeUsed).toBe(true)
    expect(after.lastSnap).not.toBeNull()
    expect(after.phase).toBe('result')
  })

  test('is once per game', () => {
    const g = challenge(afterSnap(1), makeRng(50))
    expect(challenge(g, makeRng(51))).toBe(g)
  })

  test('sometimes changes the outcome', () => {
    let changed = 0
    for (let seed = 1; seed <= 60; seed++) {
      const g = afterSnap(seed)
      const after = challenge(g, makeRng(seed * 31))
      if (after.lastSnap?.result.yards !== g.lastSnap?.result.yards) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })

  test('does not double-count the rules that fired', () => {
    // The re-roll replaces the snap, so its rule fires must replace the
    // originals rather than stack on top of them.
    for (let seed = 1; seed <= 40; seed++) {
      const g = afterSnap(seed)
      const after = challenge(g, makeRng(seed))
      for (const [key, n] of Object.entries(after.ruleFireCounts)) {
        expect(n).toBeLessThanOrEqual((g.ruleFireCounts[key] ?? 0) + 1)
      }
    }
  })

  test('is refused before a snap has happened', () => {
    const g = called()
    expect(challenge(g, makeRng(1))).toBe(g)
  })
})

describe('serialization', () => {
  // Save files depend on this. Anything with a function, Map or Set in it will
  // survive a round trip as a silently different object.
  test('a game in progress survives a JSON round trip intact', () => {
    const g = called()
    const snapped = callPlay(g, legalPlays(g)[0].id, makeRng(9))
    expect(snapped.lastSnapInput).not.toBeNull()
    expect(JSON.parse(JSON.stringify(snapped))).toEqual(snapped)
  })
})

describe('Audible', () => {
  const withAudible = (g: Game): Game => ({
    ...g,
    hand: [...g.hand, { id: 900, type: 'adj', name: 'Audible' }],
  })

  const offGroupPlay = (g: Game) => {
    const card = g.hand.find((c) => c.type === 'play' && personnelOf(c.form) !== g.declared)
    if (!card || card.type !== 'play') throw new Error('expected an out-of-personnel play in hand')
    return card
  }

  test('unlocks a play the declared personnel could not run', () => {
    const g = withAudible(called())
    const other = offGroupPlay(g)
    // Refused while the personnel still binds.
    expect(callPlay(g, other.id, makeRng(1))).toBe(g)

    const after = playAudible(g, 900, makeRng(1))
    expect(after.audibled).toBe(true)
    expect(callPlay(after, other.id, makeRng(1)).lastCall?.play).toBe(other.play)
  })

  test('widens the legal set', () => {
    const g = withAudible(called())
    expect(legalPlays(playAudible(g, 900, makeRng(1))).length).toBeGreaterThan(
      legalPlays(g).length,
    )
  })

  test('spends the card', () => {
    const g = withAudible(called())
    const after = playAudible(g, 900, makeRng(1))
    expect(after.hand.map((c) => c.id)).not.toContain(900)
    expect(after.discard.map((c) => c.id)).toContain(900)
  })

  test('reads first, then the audible — both land in the same down', () => {
    const base = called()
    const g: Game = {
      ...base,
      hand: [
        ...base.hand,
        { id: 901, type: 'adj', name: 'Hot Read' },
        { id: 900, type: 'adj', name: 'Audible' },
      ],
    }
    const read = playInfoCard(g, 901, makeRng(1))
    expect(read.known).toBe(g.defCov)
    const after = playAudible(read, 900, makeRng(1))
    expect(after.known).toBe(g.defCov)
    expect(after.audibled).toBe(true)
  })

  test('does not carry over to the next down', () => {
    const g = playAudible(withAudible(called()), 900, makeRng(1))
    const snapped = callPlay(g, legalPlays(g)[0].id, makeRng(1))
    const next = nextDown(snapped, makeRng(1))
    expect(next.audibled).toBe(false)
  })

  test('rejects a card that is not an audible', () => {
    const g = called()
    const play = legalPlays(g)[0]
    expect(playAudible(g, play.id, makeRng(1))).toBe(g)
  })
})
