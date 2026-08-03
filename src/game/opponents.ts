import { makeRng, weighted, type Rng } from './rng'
import {
  COVERAGES,
  OFF_PLAYS,
  PACKAGES,
  type CoverageName,
  type OffFormationName,
  type OffPlay,
  type OffPlayName,
  type PackageName,
  type Personnel,
} from './cards'
import type { DefLook, PlayResult } from './resolve'

export type SnapContext = {
  formName: OffFormationName
  playName: OffPlayName
  play: OffPlay
  down: number
  /** 1-based. */
  possession: number
  /** 0 = own goal line, 100 = their goal line. */
  ballOn: number
  /** How many times each rule has already fired this game. */
  firedCounts: Record<string, number>
  /** The previous call, so an opponent can react to what you keep doing. */
  lastPlayName: OffPlayName | null
}

export type PreSnapState = { def: DefLook; charge: number }

export type OpponentRule = {
  name: string
  text: string
  /** Visible rules are on the scouting report from the opening whistle. */
  visible: boolean
  /** Bends the pre-snap picture. Return null when the rule does not apply. */
  preSnap?: (ctx: SnapContext, state: PreSnapState) => PreSnapState | null
  /** Overrides the outcome. Return null when the rule does not apply. */
  postSnap?: (
    ctx: SnapContext,
    result: PlayResult,
    def: DefLook,
    rng: Rng,
  ) => PlayResult | null
}

export type CoveragePick = { down: number; toGo: number }

export type Opponent = {
  name: string
  /** 1 warm-up, 2 contender, 3 title shot. Drives how many rules they run. */
  tier: 1 | 2 | 3
  /** One line on the schedule board. */
  blurb: string
  /** How they answer your declared personnel. */
  match: (pers: Personnel) => PackageName
  pickCoverage: (pool: readonly CoverageName[], ctx: CoveragePick, rng: Rng) => CoverageName
  rules: Record<string, OpponentRule>
}

const evenly = (pool: readonly CoverageName[], rng: Rng) => weighted(pool, () => 1, rng)

const DEEP_SHOTS: readonly OffPlayName[] = ['Fade', 'Four Verticals']
const INTERIOR_RUNS: readonly OffPlayName[] = ['Inside Zone', 'Power O', 'Trap']

export const OPPONENTS: Record<string, Opponent> = {
  'The Foundry': {
    name: 'The Foundry',
    tier: 2,
    blurb: 'Heavy front, man coverage, nobody home over the top.',
    match: () => 'Base',
    // Still tilted toward man and light deep help — that is who they are — but
    // Cover 1 Blitz lands ~33% of the time rather than 60%.
    pickCoverage: (pool, _ctx, rng) =>
      weighted(pool, (c) => (c === 'Cover 3' ? 1 : COVERAGES[c].deepHelp <= 1 ? 1.5 : 2), rng),
    rules: {
      // Declaration order is execution order: gassed must run before ironFront
      // reads the possession count.
      gassed: {
        name: 'Gasses Out',
        text: 'From possession 4 on: Iron Front turns off, box drops by 1.',
        visible: false,
        preSnap: (ctx, state) => {
          if (ctx.possession < 4) return null
          return {
            ...state,
            def: { ...state.def, form: { ...state.def.form, box: state.def.form.box - 1 } },
          }
        },
      },
      ironFront: {
        name: 'Iron Front',
        text: '1st-down runs gain 2 yards at most.',
        visible: true,
        postSnap: (ctx, result) => {
          if (ctx.play.kind !== 'run') return null
          if (ctx.down !== 1 || ctx.possession >= 4) return null
          if (result.turnover || result.yards <= 2) return null
          return { ...result, yards: 2, event: 'run' }
        },
      },
      singleHigh: {
        name: 'No Deep Help',
        text: "A deep ball that isn't sacked always connects — big. They roll a safety over the top after it burns them twice.",
        visible: false,
        postSnap: (ctx, result, _def, rng) => {
          if (!DEEP_SHOTS.includes(ctx.playName)) return null
          if (result.event === 'sack' || result.turnover) return null
          // Burned twice and they finally adjust. The window is the reward for
          // discovering the rule; leaving it open all game is not a game.
          if ((ctx.firedCounts.singleHigh ?? 0) >= 2) return null
          // Still counts as fired when the base result was already big — the
          // read was right either way, so the player should learn the rule.
          if (result.yards >= 18) return result
          return { yards: Math.round(20 + rng() * 20), event: 'big play' }
        },
      },
    },
  },

  'The Shell': {
    name: 'The Shell',
    tier: 2,
    blurb: 'Two deep, bend but do not break.',
    match: (pers) => (pers === '21' ? 'Base' : pers === '12' ? 'Nickel' : 'Dime'),
    pickCoverage: (pool, _ctx, rng) =>
      weighted(pool, (c) => (COVERAGES[c].deepHelp >= 2 ? 3 : 0.8), rng),
    rules: {
      shell: {
        name: 'Two-Deep Shell',
        text: 'Deep passes never gain more than 12.',
        visible: true,
        postSnap: (ctx, result) => {
          if (!DEEP_SHOTS.includes(ctx.playName) || result.yards <= 12) return null
          return { ...result, yards: 12, event: 'complete' }
        },
      },
      softMiddle: {
        name: 'Soft Middle',
        text: "Inside runs always gain at least 4 — they can't be stuffed.",
        visible: false,
        postSnap: (ctx, result) => {
          if (!INTERIOR_RUNS.includes(ctx.playName)) return null
          if (result.turnover || result.yards >= 4) return null
          return { yards: 4, event: 'run' }
        },
      },
      teeth: {
        name: 'Red-Zone Teeth',
        text: 'Inside their 20, every play carries extra failure risk.',
        visible: false,
        postSnap: (ctx, result, _def, rng) => {
          if (ctx.ballOn < 80 || result.turnover) return null
          if (result.event === 'stuffed') return null
          if (result.event === 'sack' || result.event === 'incomplete') return null
          if (rng() >= 0.18) return null
          return ctx.play.kind === 'run'
            ? { yards: -1, event: 'stuffed' }
            : { yards: 0, event: 'incomplete' }
        },
      },
    },
  },

  'The Gamblers': {
    name: 'The Gamblers',
    tier: 2,
    blurb: 'They would rather guess wrong than sit still.',
    match: () => 'Nickel',
    pickCoverage: (pool, ctx, rng) => {
      if (ctx.down === 3 && pool.includes('Cover 1 Blitz')) return 'Cover 1 Blitz'
      return evenly(pool, rng)
    },
    rules: {
      jumpy: {
        name: 'Jumpy',
        text: 'Play action with ◆2 or more: the charge counts double.',
        visible: false,
        preSnap: (ctx, state) => {
          if (!(ctx.play.kind === 'pass' && ctx.play.pa) || state.charge < 2) return null
          return { ...state, charge: state.charge * 2 }
        },
      },
      blitz3: {
        name: 'Third-Down Blitz',
        text: 'On 3rd down they blitz. Always.',
        visible: true,
        // Enforced in pickCoverage, not as an outcome override.
      },
      quickEats: {
        name: 'Quick Game Eats It',
        text: 'A Slant against their blitz always completes for 8+.',
        visible: false,
        postSnap: (ctx, result, def, rng) => {
          if (ctx.playName !== 'Slant' || def.cov.rush < 6) return null
          const beaten =
            result.yards < 8 || result.event === 'sack' || result.event === 'incomplete'
          if (!beaten) return result
          return { yards: Math.max(8, Math.round(8 + rng() * 6)), event: 'complete' }
        },
      },
    },
  },

  /* ------------------------------- tier 1 -------------------------------- */

  'The Sandlot': {
    name: 'The Sandlot',
    tier: 1,
    blurb: 'Talented, undisciplined, and a step slow off the edge.',
    match: () => 'Base',
    pickCoverage: (pool, _ctx, rng) => evenly(pool, rng),
    rules: {
      edges: {
        name: 'Slow Off The Edge',
        text: 'Outside Zone always gains at least 5.',
        visible: true,
        postSnap: (ctx, result) => {
          if (ctx.playName !== 'Outside Zone' || result.turnover) return null
          if (result.yards >= 5) return null
          return { yards: 5, event: 'run' }
        },
      },
      drills: {
        name: 'They Wake Up',
        text: 'After two explosive plays they stop giving them up — nothing over 12.',
        visible: false,
        postSnap: (ctx, result) => {
          if (result.event !== 'breakaway' && result.event !== 'big play') return null
          // The first two are free. After that the window is shut.
          if ((ctx.firedCounts.drills ?? 0) < 2) return result
          return { ...result, yards: Math.min(result.yards, 12) }
        },
      },
    },
  },

  'The Rotation': {
    name: 'The Rotation',
    tier: 1,
    blurb: 'Deep roster, fresh legs early, nothing left by the fourth.',
    match: (pers) => (pers === '11' ? 'Nickel' : 'Base'),
    pickCoverage: (pool, _ctx, rng) => evenly(pool, rng),
    rules: {
      fresh: {
        name: 'Fresh Bodies',
        text: 'For the first two possessions their box is one heavier.',
        visible: true,
        preSnap: (ctx, state) => {
          if (ctx.possession > 2) return null
          return {
            ...state,
            def: { ...state.def, form: { ...state.def.form, box: state.def.form.box + 1 } },
          }
        },
      },
      wears: {
        name: 'Nothing Left',
        text: 'From possession 3 their box drops by two and the coverage sags.',
        visible: false,
        preSnap: (ctx, state) => {
          if (ctx.possession < 3) return null
          return {
            ...state,
            def: {
              form: { ...state.def.form, box: state.def.form.box - 2 },
              cov: { ...state.def.cov, underneath: state.def.cov.underneath - 1 },
            },
          }
        },
      },
    },
  },

  'The Overload': {
    name: 'The Overload',
    tier: 1,
    blurb: 'They send an extra rusher until it stops working.',
    match: () => 'Nickel',
    pickCoverage: (pool, _ctx, rng) =>
      weighted(pool, (c) => (COVERAGES[c].rush >= 6 ? 1.6 : 1), rng),
    rules: {
      heat: {
        name: 'Extra Rusher',
        text: 'One more man comes than the protection accounts for.',
        visible: true,
        preSnap: (ctx, state) => {
          if (ctx.play.kind !== 'pass') return null
          // Once you have made them pay twice, they stop bringing it.
          if ((ctx.firedCounts.settle ?? 0) >= 2) return null
          // Never stacked on top of a coverage that already brings six.
          if (state.def.cov.rush >= 6) return null
          return {
            ...state,
            def: { ...state.def, cov: { ...state.def.cov, rush: state.def.cov.rush + 1 } },
          }
        },
      },
      settle: {
        name: 'They Settle Down',
        text: 'Beat the pressure twice for 10+ and the extra rusher stays home.',
        visible: false,
        postSnap: (ctx, result) => {
          if (ctx.play.kind !== 'pass' || result.turnover) return null
          if (result.yards < 10) return null
          return result
        },
      },
    },
  },

  /* ------------------------------- tier 3 -------------------------------- */

  'The Mirror': {
    name: 'The Mirror',
    tier: 3,
    blurb: 'They have seen the film. Repeat yourself and they are waiting.',
    match: (pers) => (pers === '21' ? 'Base' : pers === '12' ? 'Nickel' : 'Dime'),
    pickCoverage: (pool, _ctx, rng) =>
      weighted(pool, (c) => (COVERAGES[c].man ? 3 : 1), rng),
    rules: {
      filmStudy: {
        name: 'Film Study',
        text: 'Call the same play twice in a row and it gains 3 at most.',
        visible: true,
        postSnap: (ctx, result) => {
          if (ctx.lastPlayName !== ctx.playName || result.turnover) return null
          if (result.yards <= 3) return null
          return { ...result, yards: 3 }
        },
      },
      sticky: {
        name: 'Sticky',
        text: 'Their man coverage travels — quick passes lose their cushion.',
        visible: false,
        postSnap: (ctx, result, def) => {
          if (ctx.playName !== 'Slant' || !def.cov.man || result.turnover) return null
          if (result.yards <= 3) return null
          return { ...result, yards: Math.max(3, result.yards - 2) }
        },
      },
      adjusts: {
        name: 'They Adjust',
        text: 'The third time a deep shot connects, they take it away for good.',
        visible: false,
        postSnap: (ctx, result) => {
          if (!DEEP_SHOTS.includes(ctx.playName) || result.turnover) return null
          // Only a shot that actually connected teaches them anything.
          if (result.yards < 15) return null
          if ((ctx.firedCounts.adjusts ?? 0) < 2) return result
          return { ...result, yards: 12, event: 'complete' }
        },
      },
      noQuit: {
        name: 'No Quit',
        text: 'Inside their 20 the box gets two heavier.',
        visible: false,
        preSnap: (ctx, state) => {
          if (ctx.ballOn < 80) return null
          return {
            ...state,
            def: { ...state.def, form: { ...state.def.form, box: state.def.form.box + 2 } },
          }
        },
      },
    },
  },

  'The Vice': {
    name: 'The Vice',
    tier: 3,
    blurb: 'Every drive another body walks into the box. Throw it or die.',
    match: () => 'Base',
    pickCoverage: (pool, _ctx, rng) =>
      weighted(pool, (c) => (COVERAGES[c].boxSupport >= 1 ? 2 : 1), rng),
    rules: {
      squeeze: {
        name: 'The Squeeze',
        text: 'The box gets one heavier for every possession you have used.',
        visible: true,
        // The counterweight to a tier-3 roster that otherwise only punishes the
        // pass: against these, throwing it is the answer.
        preSnap: (ctx, state) => {
          const grip = Math.min(2, ctx.possession - 1)
          if (grip <= 0) return null
          return {
            ...state,
            def: { ...state.def, form: { ...state.def.form, box: state.def.form.box + grip } },
          }
        },
      },
      earlyGift: {
        name: 'Slow Starters',
        text: 'On your first possession they are a step behind: no stuffs, no sacks.',
        visible: false,
        postSnap: (ctx, result) => {
          if (ctx.possession > 1) return null
          if (result.event === 'stuffed') return { yards: 2, event: 'run' }
          if (result.event === 'sack') return { yards: 0, event: 'incomplete' }
          return null
        },
      },
      clamp: {
        name: 'Clamp',
        text: 'Nothing gains more than 28.',
        visible: false,
        postSnap: (_ctx, result) => {
          if (result.yards <= 28) return null
          return { ...result, yards: 28 }
        },
      },
      lastStand: {
        name: 'Last Stand',
        text: 'On your final possession, 3rd-down runs gain 1 at most.',
        visible: false,
        postSnap: (ctx, result) => {
          if (ctx.possession < 5 || ctx.down !== 3 || ctx.play.kind !== 'run') return null
          if (result.turnover || result.yards <= 1) return null
          return { yards: 1, event: 'run' }
        },
      },
    },
  },

  'The Closer': {
    name: 'The Closer',
    tier: 3,
    blurb: 'They give you the first quarter and take the rest.',
    match: (pers) => (pers === '11' ? 'Dime' : 'Base'),
    pickCoverage: (pool, ctx, rng) => {
      if (ctx.down >= 3 && pool.includes('Cover 1 Blitz')) return 'Cover 1 Blitz'
      return weighted(pool, (c) => (COVERAGES[c].man ? 2 : 1), rng)
    },
    rules: {
      lateBlitz: {
        name: 'Money Down',
        text: 'They blitz every third and fourth down.',
        visible: true,
      },
      gift: {
        name: 'Opening Script',
        text: 'Your first possession is free — the box is two lighter.',
        visible: false,
        preSnap: (ctx, state) => {
          if (ctx.possession > 1) return null
          return {
            ...state,
            def: { ...state.def, form: { ...state.def.form, box: state.def.form.box - 2 } },
          }
        },
      },
      shutTheDoor: {
        name: 'Shut The Door',
        text: 'From possession 3 on, deep balls are capped at 10.',
        visible: false,
        postSnap: (ctx, result) => {
          if (ctx.possession < 3 || !DEEP_SHOTS.includes(ctx.playName)) return null
          if (result.yards <= 10) return null
          return { ...result, yards: 10, event: 'complete' }
        },
      },
      punish: {
        name: 'Punish The Predictable',
        text: 'Run it on 1st down twice in a row and the second one is stuffed.',
        visible: false,
        postSnap: (ctx, result) => {
          if (ctx.down !== 1 || ctx.play.kind !== 'run' || result.turnover) return null
          if (!ctx.lastPlayName || OFF_PLAYS[ctx.lastPlayName].kind !== 'run') return null
          if (result.yards <= 0) return null
          return { yards: -1, event: 'stuffed' }
        },
      },
    },
  },
}

export const OPPONENT_NAMES = Object.keys(OPPONENTS)

/** Everyone who belongs in a given week of the schedule. */
export const opponentsByTier = (tier: number): string[] =>
  OPPONENT_NAMES.filter((n) => OPPONENTS[n].tier === tier)

export type CoverageLean = 'man' | 'zone' | 'balanced'

const shareCache = new Map<string, number>()

/**
 * What fraction of snaps this opponent plays man, sampled from their own
 * coverage picker across every personnel group and down they might see.
 * Derived rather than hand-labelled, so it can never drift from what they
 * actually call. Cached — it is a fixed property of the opponent.
 */
export function manShare(name: string): number {
  const cached = shareCache.get(name)
  if (cached !== undefined) return cached

  const opponent = OPPONENTS[name]
  const rng = makeRng(20260803)
  let man = 0
  let total = 0

  for (const pers of ['21', '12', '11'] as const) {
    const covs = PACKAGES[opponent.match(pers)].covs
    for (const down of [1, 2, 3, 4]) {
      for (const toGo of [2, 7, 12]) {
        for (let i = 0; i < 40; i++) {
          if (COVERAGES[opponent.pickCoverage(covs, { down, toGo }, rng)].man) man++
          total++
        }
      }
    }
  }

  const share = man / total
  shareCache.set(name, share)
  return share
}

export const coverageLean = (name: string): CoverageLean => {
  const share = manShare(name)
  return share >= 0.55 ? 'man' : share <= 0.28 ? 'zone' : 'balanced'
}

export const LEAN_TEXT: Record<CoverageLean, string> = {
  man: 'route detail beats them',
  zone: 'coverage recognition beats them',
  balanced: 'no drill is a lock against them',
}
