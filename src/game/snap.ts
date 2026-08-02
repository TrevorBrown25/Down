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

  const ctx: SnapContext = {
    formName: input.formName,
    playName: input.playName,
    play,
    down: input.down,
    possession: input.possession,
    ballOn: input.ballOn,
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

  let result = baseResolve(form, play, state.def, state.charge, input.mods, rng)
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
