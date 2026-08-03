import { pick, type Rng } from './rng'
import type { Personnel } from './cards'

/**
 * The week between games. You get one scenario and two ways to take it, and
 * most of them cost something — a practice that sharpens one group tends to
 * leave another one sore.
 */

/** What a practice week actually works on. Each drill is its own axis. */
export type Drill = 'blocking' | 'routes' | 'film'

export const DRILLS: Record<Drill, { label: string; gain: string }> = {
  blocking: { label: 'blocking', gain: 'blocks better' },
  routes: { label: 'route running', gain: 'beats man coverage' },
  film: { label: 'film study', gain: 'finds the holes in zone' },
}

/** What a group has banked. Drills stack with each other, not with themselves. */
export type GroupBonus = {
  /** Extra blocker: reaches the run's box maths and the pass rush alike. */
  block?: number
  /** Sharper routes — only worth anything when they play man. */
  man?: number
  /** Better recognition — only worth anything when they play zone. */
  zone?: number
}

export type GroupTrim = Partial<Record<Personnel, GroupBonus>>

const AXIS: Record<Drill, keyof GroupBonus> = {
  blocking: 'block',
  routes: 'man',
  film: 'zone',
}

/**
 * One week of work is as far as a single drill goes. Running the same drill all
 * season would swamp every other decision in the run — but there are nine
 * distinct group-and-drill combinations, so there is nearly always somewhere
 * useful left to put a practice week.
 */
export const PRACTICE_CAP = 1

/**
 * How much one week of work is worth on its axis. Blocking is deliberately
 * smaller: a blocker moves every snap that group takes, where a coverage drill
 * only cashes against the half of coverages it was aimed at.
 */
export const DRILL_STRENGTH: Record<Drill, number> = {
  blocking: 1,
  routes: 2,
  film: 2,
}

export type EventEffect =
  /** Sharper for the rest of the season, on one axis for one group. */
  | { kind: 'practice'; group: Personnel; drill: Drill }
  /** Banged up for one game: -1 blocker for that group, then it clears. */
  | { kind: 'injury'; group: Personnel; severity?: number }
  /** A wider card choice this week. */
  | { kind: 'offers'; extra: number }
  /** This week you may cut this many cards. */
  | { kind: 'cut'; count?: number }
  /** Learn one hidden tendency of next week's opponent before kickoff. */
  | { kind: 'scout' }
  /** Extra ● in the next game only. */
  | { kind: 'chips'; extra: number }

export type EventOption = {
  label: string
  effects: readonly EventEffect[]
}

export type GameEvent = {
  id: string
  title: string
  text: string
  options: readonly [EventOption, EventOption]
}

const practice = (group: Personnel, drill: Drill): EventEffect => ({ kind: 'practice', group, drill })
const injury = (group: Personnel, severity?: number): EventEffect => ({
  kind: 'injury',
  group,
  ...(severity === undefined ? {} : { severity }),
})

/**
 * Roughly half the weeks put a cut on one side. Trimming the sheet is the
 * strongest thing measured anywhere in the run, so it has to be something a
 * week buys you — and something you give up real value to take.
 */
export const EVENTS: readonly GameEvent[] = [
  {
    id: 'cutday',
    title: 'Cut Day',
    text: 'The sheet has to come down by Friday. Somebody is not going to like it.',
    options: [
      { label: 'Trim the sheet', effects: [{ kind: 'cut' }] },
      { label: 'Keep everyone happy', effects: [{ kind: 'chips', extra: 2 }] },
    ],
  },
  {
    id: 'install',
    title: 'Install Week',
    text: 'The playbook has outgrown the practice week. Something has to give.',
    options: [
      {
        label: 'Strip it to the studs',
        effects: [{ kind: 'cut', count: 2 }, injury('12', 2)],
      },
      { label: 'Add a wrinkle', effects: [{ kind: 'offers', extra: 2 }] },
    ],
  },
  {
    id: 'churn',
    title: 'Roster Churn',
    text: 'Waivers are open. Half the league is shopping and your sheet is bloated.',
    options: [
      { label: 'Clear a spot', effects: [{ kind: 'cut' }, { kind: 'offers', extra: 1 }] },
      { label: 'Stand pat', effects: [practice('12', 'blocking'), { kind: 'chips', extra: 1 }] },
    ],
  },
  {
    id: 'analytics',
    title: 'The Analytics Hire',
    text: 'A numbers guy has a chart. It says half your call sheet is dead weight.',
    options: [
      { label: 'Listen to him', effects: [{ kind: 'cut' }] },
      { label: 'Trust your gut', effects: [{ kind: 'scout' }, { kind: 'chips', extra: 1 }] },
    ],
  },
  {
    id: 'bye',
    title: 'Bye Week',
    text: 'A whole week with nothing on it. The first one all season.',
    options: [
      {
        label: 'Overhaul the whole sheet',
        effects: [{ kind: 'cut', count: 2 }, injury('21', 2)],
      },
      { label: 'Rest and drill', effects: [practice('21', 'blocking'), { kind: 'chips', extra: 1 }] },
    ],
  },
  {
    id: 'shortweek',
    title: 'Short Week',
    text: 'Thursday kickoff. There is not enough week in the week.',
    options: [
      { label: 'Cut the install down', effects: [{ kind: 'cut' }, { kind: 'chips', extra: 1 }] },
      { label: 'Push through it', effects: [injury('21'), { kind: 'offers', extra: 2 }] },
    ],
  },
  {
    id: 'rain',
    title: 'Rain All Week',
    text: 'The practice field is a swamp and the forecast says it stays that way.',
    options: [
      { label: 'Grind in the mud', effects: [practice('21', 'blocking'), injury('11')] },
      { label: 'Move it indoors', effects: [{ kind: 'offers', extra: 2 }] },
    ],
  },
  {
    id: 'film',
    title: 'Film Session',
    text: 'Somebody got hold of next week’s tape. Watching it costs you the install.',
    options: [
      { label: 'Break down the tape', effects: [{ kind: 'scout' }] },
      { label: 'Study coverages instead', effects: [practice('12', 'film')] },
    ],
  },
  {
    id: 'contract',
    title: 'Contract Year',
    text: 'Two players want the ball and only one of them can have it.',
    options: [
      { label: 'Feature the back', effects: [practice('21', 'blocking'), injury('11')] },
      { label: 'Feature the slot', effects: [practice('11', 'routes'), injury('21')] },
    ],
  },
  {
    id: 'pads',
    title: 'Padded Practice',
    text: 'Full pads on a short week. The line wants it. The trainer does not.',
    options: [
      { label: 'Full pads', effects: [practice('12', 'blocking'), injury('12')] },
      { label: 'Walkthrough only', effects: [{ kind: 'chips', extra: 1 }, { kind: 'offers', extra: 1 }] },
    ],
  },
  {
    id: 'walkon',
    title: 'The Walk-On',
    text: 'A kid nobody scouted has been wrecking the scout team all week.',
    options: [
      { label: 'Give him reps', effects: [practice('11', 'routes')] },
      { label: 'Leave him on scout team', effects: [{ kind: 'scout' }, { kind: 'chips', extra: 1 }] },
    ],
  },
  {
    id: 'coordinator',
    title: 'Coordinator Interview',
    text: 'Your coordinator is up for a head job. He is distracted and everyone knows it.',
    options: [
      { label: 'Let him take the meeting', effects: [{ kind: 'offers', extra: 1 }, injury('12')] },
      { label: 'Keep him in the building', effects: [practice('21', 'film')] },
    ],
  },
  {
    id: 'jugs',
    title: 'Jugs Machine',
    text: 'The receivers have been staying late. The backs have been going home.',
    options: [
      { label: 'Route detail with the wideouts', effects: [practice('11', 'routes')] },
      { label: 'Coverage recognition for everyone', effects: [practice('11', 'film')] },
    ],
  },
  {
    id: 'joint',
    title: 'Joint Practice',
    text: 'Another club offers to share a field. Live reps, live consequences.',
    options: [
      {
        label: 'Take the work',
        effects: [practice('12', 'routes'), injury('12')],
      },
      { label: 'Stay home and install', effects: [practice('12', 'blocking')] },
    ],
  },
  {
    id: 'chalk',
    title: 'Chalk Talk',
    text: 'A whole day in the meeting room. No pads, no field, no excuses.',
    options: [
      { label: 'Zone beaters', effects: [practice('21', 'film')] },
      { label: 'Man beaters', effects: [practice('21', 'routes')] },
    ],
  },
  {
    id: 'veteran',
    title: 'The Veteran',
    text: 'An old lineman is available. He can still play — for about one game.',
    options: [
      { label: 'Sign him', effects: [practice('11', 'blocking'), { kind: 'chips', extra: 1 }] },
      { label: 'Spend the money on the scouting department', effects: [{ kind: 'scout' }, { kind: 'offers', extra: 1 }] },
    ],
  },
]

/** Two different scenarios never land back to back. */
export function nextEvent(seen: readonly string[], rng: Rng): GameEvent {
  const fresh = EVENTS.filter((e) => !seen.includes(e.id))
  return pick(fresh.length > 0 ? fresh : EVENTS, rng)
}

/**
 * A group already at its peak on that drill gains nothing from another week of
 * it. The player has to be able to see this — otherwise the option reads as
 * upside and is really just the injury attached to it.
 */
export function wasted(effect: EventEffect, conditioning: GroupTrim): boolean {
  if (effect.kind !== 'practice') return false
  const axis = AXIS[effect.drill]
  return (conditioning[effect.group]?.[axis] ?? 0) >= PRACTICE_CAP * DRILL_STRENGTH[effect.drill]
}

/** Bank a practice week, capped on that one axis. */
export function addPractice(base: GroupTrim, group: Personnel, drill: Drill): GroupTrim {
  const axis = AXIS[drill]
  const current = base[group] ?? {}
  const step = DRILL_STRENGTH[drill]
  return {
    ...base,
    [group]: { ...current, [axis]: Math.min((current[axis] ?? 0) + step, PRACTICE_CAP * step) },
  }
}

/** Bank a knock. Not capped — it is meant to hurt. */
export function addInjury(base: GroupTrim, group: Personnel, severity = 1): GroupTrim {
  const current = base[group] ?? {}
  return { ...base, [group]: { ...current, block: (current.block ?? 0) - severity } }
}

/**
 * How much of a drill carries to the groups it was not aimed at. A week of
 * route detail is mostly for the receivers who ran it, but the whole offense
 * sits in that meeting — without this, a drill is dead on the majority of
 * snaps, because you only declare its group some of the time.
 *
 * Gains spill. A knock does not: that player is hurt, and nobody else is.
 */
export const SPILL = 0.15

/** What a given personnel group actually brings to the snap. */
export function bonusFor(trim: GroupTrim, pers: Personnel): GroupBonus {
  const own = trim[pers] ?? {}
  const out: GroupBonus = {}

  for (const axis of ['block', 'man', 'zone'] as const) {
    let v = own[axis] ?? 0
    for (const other of ['21', '12', '11'] as const) {
      if (other === pers) continue
      const banked = trim[other]?.[axis] ?? 0
      if (banked > 0) v += banked * SPILL
    }
    if (v !== 0) out[axis] = v
  }
  return out
}

/** What the offense actually fields: conditioning and knocks, combined. */
export function combineTrim(conditioning: GroupTrim, injuries: GroupTrim): GroupTrim {
  const out: GroupTrim = {}
  for (const g of ['21', '12', '11'] as const) {
    const a = conditioning[g] ?? {}
    const b = injuries[g] ?? {}
    const merged: GroupBonus = {}
    for (const axis of ['block', 'man', 'zone'] as const) {
      const v = (a[axis] ?? 0) + (b[axis] ?? 0)
      if (v !== 0) merged[axis] = v
    }
    if (Object.keys(merged).length > 0) out[g] = merged
  }
  return out
}

/** One line per effect, for the card face. */
export function describe(effect: EventEffect): string {
  switch (effect.kind) {
    case 'practice':
      return `${effect.group} personnel ${DRILLS[effect.drill].gain}, all season`
    case 'injury': {
      const s = effect.severity ?? 1
      return s > 1
        ? `${effect.group} personnel is badly banged up next game (-${s} blockers)`
        : `${effect.group} personnel is banged up next game`
    }
    case 'offers':
      return `+${effect.extra} cards to choose from this week`
    case 'cut': {
      const n = effect.count ?? 1
      return n > 1 ? `cut ${n} cards from your sheet` : 'cut a card from your sheet'
    }
    case 'scout':
      return 'learn one hidden tendency before kickoff'
    case 'chips':
      return `+${effect.extra} ● in the next game`
  }
}
