import type { Rng } from './rng'
import {
  DEF_ADJ,
  type Coverage,
  type DefAdjName,
  type DefFormation,
  type OffFormation,
  type OffPlay,
  type PassPlay,
  type RunPlay,
} from './cards'

export type PlayEvent =
  | 'run'
  | 'stuffed'
  | 'breakaway'
  | 'fumble'
  | 'complete'
  | 'incomplete'
  | 'sack'
  | 'interception'
  | 'big play'

export type PlayResult = {
  yards: number
  event: PlayEvent
  turnover?: boolean
  /** A chip absorbed what would have been a sack or a turnover. */
  protected?: boolean
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The defense's post-snap look: formation traits plus the coverage it is running. */
export type DefLook = { form: DefFormation; cov: Coverage }

export function applyDefAdj(look: DefLook, name: DefAdjName | null): DefLook {
  if (!name) return look
  const a = DEF_ADJ[name]
  return {
    form: {
      ...look.form,
      cov: look.form.cov + (a.cov ?? 0),
      rushBonus: look.form.rushBonus + (a.rush ?? 0),
    },
    cov: {
      ...look.cov,
      boxSupport: look.cov.boxSupport + (a.boxSupport ?? 0),
      deepHelp: look.cov.deepHelp + (a.deepHelp ?? 0),
      underneath: look.cov.underneath + (a.underneath ?? 0),
    },
  }
}

/**
 * Play action pulls the defense forward: more box, and both levels of coverage
 * thin out as the underneath defenders step up to meet the run.
 */
export function applyPA(cov: Coverage, charge: number): Coverage {
  if (charge <= 0) return cov
  return {
    ...cov,
    boxSupport: cov.boxSupport + charge,
    deepHelp: cov.deepHelp - 1,
    underneath: cov.underneath - 1,
  }
}

export type SnapModifiers = {
  /** "Send It" — explosive chance tripled. */
  juice: boolean
  /** "Fresh Legs" — one extra blocker. */
  bonusBlockers: number
}

export const NO_MODS: SnapModifiers = { juice: false, bonusBlockers: 0 }

export function resolveRun(
  form: OffFormation,
  play: RunPlay,
  def: DefLook,
  mods: SnapModifiers,
  rng: Rng,
): PlayResult {
  const blockers = form.blockers + (play.extraBlocker ?? 0) + mods.bonusBlockers
  const commitment = def.form.box + def.cov.boxSupport
  const boxAdv = blockers - commitment - form.spread * 0.5
  const risk = play.width === 1 ? 1.6 : 1.0
  const canStuff = !(play.noStuffLight && def.form.box <= 6)

  // Does the look suit the play? Misdirection wants a crowded, over-pursuing
  // front; a numbers play wants them light. Positive means it fits.
  const crowd = commitment - 6.5
  const fit = play.vsBox * crowd

  // A sneak is a yard. That is the whole card.
  if (play.sneak) {
    if (rng() < 0.004) return { yards: 0, event: 'fumble', turnover: true }
    return { yards: boxAdv > 0 ? 2 : 1, event: 'run' }
  }

  if (canStuff && rng() < clamp((0.12 - boxAdv * 0.06 - fit * 0.03) * risk, 0.02, 0.6)) {
    return { yards: Math.round(-2 - rng() * 2), event: 'stuffed' }
  }
  if (rng() < 0.007) return { yards: 0, event: 'fumble', turnover: true }

  const breakaway = clamp(
    (0.05 + boxAdv * 0.025) * risk * (mods.juice ? 3 : 1),
    0.015,
    mods.juice ? 0.45 : 0.16,
  )
  if (rng() < breakaway) {
    return {
      yards: Math.round(12 + (3 - def.cov.deepHelp) * 9 + rng() * 22),
      event: 'breakaway',
    }
  }

  const edge = play.width === 1 ? 7 - def.form.box : 0
  return {
    yards: Math.max(1, Math.round(play.base + boxAdv * 1.5 + edge + fit * 1.6)),
    event: 'run',
  }
}

export function resolvePass(
  form: OffFormation,
  play: PassPlay,
  def: DefLook,
  mods: SnapModifiers,
  rng: Rng,
): PlayResult {
  const blockers = form.blockers + mods.bonusBlockers
  const heat = def.cov.rush + def.form.rushBonus - blockers + play.time

  // A screen wants the rush. Everyone who came upfield is now blocked out of
  // the play, so the pressure that would have been a sack is the gain instead.
  if (play.screen) {
    if (rng() < 0.03) return { yards: 0, event: 'incomplete' }
    const sprung = Math.max(0, heat) * 2.6
    if (rng() < 0.06 + Math.max(0, heat) * 0.03) {
      return { yards: Math.round(play.base + sprung + 14 + rng() * 20), event: 'big play' }
    }
    return { yards: Math.max(1, Math.round(play.base + sprung)), event: 'complete' }
  }

  // Moving the pocket takes most of the rush out of the play.
  const pressure = play.bootleg ? heat - 3 : heat
  if (rng() < clamp(0.05 + (pressure - 2) * 0.16, 0.02, 0.75)) {
    return { yards: Math.round(-7 - rng() * 3), event: 'sack' }
  }

  const matchup = def.cov.man ? play.vsMan : -play.vsMan
  // Which defenders are actually in position depends on how far the route runs.
  // Deep help never polices the quick game, and vice versa.
  const help =
    play.depth >= 3
      ? def.cov.deepHelp
      : play.depth === 2
        ? (def.cov.deepHelp + def.cov.underneath) / 2
        : def.cov.underneath
  const cover = help + def.form.cov - play.depth
  let inc = clamp(0.16 + cover * 0.08 + play.depth * 0.07 - matchup * 0.11, 0.04, 0.75)
  if (play.allOrNothing) {
    inc = clamp(inc + 0.1 - (def.form.box >= 7 ? 0.25 : 0), 0.04, 0.8)
  }

  if (rng() < inc * (def.cov.man ? 0.025 : 0.04) * (1 + play.depth * 0.3)) {
    return { yards: 0, event: 'interception', turnover: true }
  }
  if (rng() < inc) return { yards: 0, event: 'incomplete' }
  if (play.allOrNothing) {
    return { yards: Math.round(20 + rng() * 25), event: 'big play' }
  }

  const tail = clamp(
    ((def.cov.man ? 0.09 : 0.035) + (3 - def.cov.deepHelp) * 0.025) * (mods.juice ? 3 : 1),
    0.02,
    mods.juice ? 0.5 : 0.2,
  )
  if (rng() < tail) {
    return { yards: Math.round(play.base + 15 + rng() * 35), event: 'big play' }
  }

  return { yards: Math.max(1, Math.round(play.base - cover * 2)), event: 'complete' }
}

/** The physics layer: no opponent rules applied. */
export function baseResolve(
  form: OffFormation,
  play: OffPlay,
  def: DefLook,
  charge: number,
  mods: SnapModifiers,
  rng: Rng,
): PlayResult {
  if (play.kind === 'run') return resolveRun(form, play, def, mods, rng)
  const cov = play.pa ? applyPA(def.cov, charge) : def.cov
  return resolvePass(form, play, { ...def, cov }, mods, rng)
}

/** "Max Protect" — one chip turns the worst outcomes into merely bad ones. */
export function applyProtection(result: PlayResult): PlayResult {
  if (result.event === 'sack') return { yards: 0, event: 'incomplete', protected: true }
  if (result.event === 'interception') {
    return { yards: 0, event: 'incomplete', protected: true }
  }
  if (result.event === 'fumble') return { yards: 1, event: 'run', protected: true }
  return result
}
