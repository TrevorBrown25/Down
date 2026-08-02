import { weighted, type Rng } from './rng'
import {
  COVERAGES,
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
  /** How they answer your declared personnel. */
  match: (pers: Personnel) => PackageName
  pickCoverage: (pool: readonly CoverageName[], ctx: CoveragePick, rng: Rng) => CoverageName
  rules: Record<string, OpponentRule>
}

const evenly = (pool: readonly CoverageName[], rng: Rng) => weighted(pool, () => 1, rng)

const DEEP_SHOTS: readonly OffPlayName[] = ['Deep Pass', 'Four Verticals']
const INTERIOR_RUNS: readonly OffPlayName[] = ['Inside Run', 'Power O']

// NOTE: "Steel Curtain" is a Pittsburgh Steelers trademark. Rename before this
// build goes anywhere public.
export const OPPONENTS: Record<string, Opponent> = {
  'Steel Curtain': {
    name: 'Steel Curtain',
    match: () => 'Base',
    pickCoverage: (pool, _ctx, rng) =>
      weighted(pool, (c) => (c === 'Cover 3' ? 0.5 : COVERAGES[c].deepHelp <= 1 ? 3 : 1.5), rng),
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
        text: "A deep ball that isn't sacked always connects — big.",
        visible: false,
        postSnap: (ctx, result, _def, rng) => {
          if (!DEEP_SHOTS.includes(ctx.playName)) return null
          if (result.event === 'sack' || result.turnover) return null
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
        text: 'A quick pass against their blitz always completes for 8+.',
        visible: false,
        postSnap: (ctx, result, def, rng) => {
          if (ctx.playName !== 'Quick Pass' || def.cov.rush < 6) return null
          const beaten =
            result.yards < 8 || result.event === 'sack' || result.event === 'incomplete'
          if (!beaten) return result
          return { yards: Math.max(8, Math.round(8 + rng() * 6)), event: 'complete' }
        },
      },
    },
  },
}

export const OPPONENT_NAMES = Object.keys(OPPONENTS)
