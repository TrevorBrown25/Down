import type { Rng } from './rng'
import {
  COVERAGES,
  DEF_FORMATIONS,
  OFF_FORMATIONS,
  OFF_PLAYS,
  type CoverageName,
  type DefAdjName,
  type DefFormationName,
  type OffFormationName,
  type OffPlayName,
} from './cards'
import { bonusFor, type GroupTrim } from './events'
import type { Opponent, PreSnapState, SnapContext } from './opponents'
import {
  applyDefAdj,
  applyProtection,
  baseResolve,
  type PlayResult,
  type SnapModifiers,
} from './resolve'

export type SnapInput = {
  opponent: Opponent
  formName: OffFormationName
  playName: OffPlayName
  defFormName: DefFormationName
  coverageName: CoverageName
  defAdj: DefAdjName | null
  /** The ◆ meter at the snap. Only play action spends it. */
  charge: number
  down: number
  possession: number
  ballOn: number
  /** "Max Protect" chip. */
  protect: boolean
  mods: SnapModifiers
  /** How many times each opponent rule has fired so far this game. */
  firedCounts: Record<string, number>
  /** The previous call this game, or null on the first snap. */
  lastPlayName: OffPlayName | null
  /** Blocker adjustments per personnel group, from practice weeks and knocks. */
  groupTrim: GroupTrim
}

export type SnapOutcome = {
  result: PlayResult
  /** Keys of the opponent rules that applied, in execution order. */
  fired: string[]
  /** Charge actually brought to bear, after pre-snap rules. */
  chargeUsed: number
}

/**
 * One snap, start to finish: pre-snap rules bend the picture, the physics layer
 * rolls it out, chips absorb disasters, then post-snap rules override the result.
 */
export function resolveSnap(input: SnapInput, rng: Rng): SnapOutcome {
  const play = OFF_PLAYS[input.playName]
  const form = OFF_FORMATIONS[input.formName]

  // Practice weeks and knocks ride in as snap modifiers, the same channel the
  // chips use, so there is one place where a snap can be bent.
  const bonus = bonusFor(input.groupTrim, form.pers)
  const mods: SnapModifiers = {
    ...input.mods,
    bonusBlockers: input.mods.bonusBlockers + (bonus.block ?? 0),
    vsMan: input.mods.vsMan + (bonus.man ?? 0),
    vsZone: input.mods.vsZone + (bonus.zone ?? 0),
  }

  const ctx: SnapContext = {
    formName: input.formName,
    playName: input.playName,
    play,
    down: input.down,
    possession: input.possession,
    ballOn: input.ballOn,
    firedCounts: input.firedCounts,
    lastPlayName: input.lastPlayName,
  }

  let state: PreSnapState = {
    def: applyDefAdj(
      { form: DEF_FORMATIONS[input.defFormName], cov: COVERAGES[input.coverageName] },
      input.defAdj,
    ),
    charge: play.kind === 'pass' && play.pa ? input.charge : 0,
  }

  const fired: string[] = []
  const rules = Object.entries(input.opponent.rules)

  for (const [key, rule] of rules) {
    const next = rule.preSnap?.(ctx, state)
    if (next) {
      state = next
      fired.push(key)
    }
  }

  let result = baseResolve(form, play, state.def, state.charge, mods, rng)
  if (input.protect) result = applyProtection(result)

  for (const [key, rule] of rules) {
    const next = rule.postSnap?.(ctx, result, state.def, rng)
    if (next) {
      result = next
      fired.push(key)
    }
  }

  return { result, fired, chargeUsed: state.charge }
}
