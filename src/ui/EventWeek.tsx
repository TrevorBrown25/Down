import {
  describe,
  wasted,
  type EventEffect,
  type EventOption,
  type GroupTrim,
} from '../game/events'
import { currentNode, type Run } from '../game/run'
import { NextUp } from './NextUp'
import { useGame } from './store'

/** Gains read as chips, costs read as danger. The colour is the whole tell. */
const isCost = (e: EventEffect) => e.kind === 'injury'

function Effect({ effect, conditioning }: { effect: EventEffect; conditioning: GroupTrim }) {
  // A drill that group has already maxed out is not upside. Saying so is the
  // difference between a decision and a trap.
  const dead = wasted(effect, conditioning)
  const cost = isCost(effect)

  return (
    <li className="flex items-baseline gap-2 font-mono text-[10px] leading-relaxed">
      <span className={dead ? 'text-hash' : cost ? 'text-danger' : 'text-chip'}>
        {dead ? '·' : cost ? '−' : '+'}
      </span>
      <span className={dead ? 'text-hash' : cost ? 'text-danger/85' : 'text-chalk-dim'}>
        <span className={dead ? 'line-through' : undefined}>{describe(effect)}</span>
        {dead && (
          <span className="ml-2 whitespace-nowrap text-[9px] uppercase tracking-[0.14em]">
            already peaked
          </span>
        )}
      </span>
    </li>
  )
}

function Option({
  option,
  conditioning,
  onPick,
}: {
  option: EventOption
  conditioning: GroupTrim
  onPick: () => void
}) {
  return (
    <button
      onClick={onPick}
      className="group flex min-h-[168px] flex-1 flex-col justify-between rounded-sm border border-hash bg-board-deep/60 p-5 text-left transition-all hover:border-skill hover:bg-skill/[0.07]"
    >
      <div className="font-display text-2xl leading-tight tracking-wide text-chalk transition-colors group-hover:text-skill">
        {option.label.toUpperCase()}
      </div>
      <ul className="mt-4 space-y-1.5">
        {option.effects.map((effect, i) => (
          <Effect key={i} effect={effect} conditioning={conditioning} />
        ))}
      </ul>
    </button>
  )
}

export function EventWeek({ run }: { run: Run }) {
  const chooseEvent = useGame((s) => s.chooseEvent)
  const event = run.pendingEvent
  if (!event) return null
  const node = currentNode(run)

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="reveal">
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-chalk-faint">
          {node ? `the week before week ${node.week}` : 'between games'} · {run.wins}-{run.losses}
        </div>
        <h2 className="mt-1 font-display text-4xl leading-none tracking-tight text-chalk">
          {event.title.toUpperCase()}
        </h2>
        <p className="mt-3 max-w-xl font-mono text-[11px] leading-relaxed text-chalk-dim">
          {event.text}
        </p>
      </div>

      {/* The read has to be on screen while you choose, not one screen later. */}
      <div className="mt-8">
        <NextUp run={run} />
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        {event.options.map((option, i) => (
          <div
            key={option.label}
            className="reveal flex flex-1"
            style={{ animationDelay: `${120 + i * 90}ms` }}
          >
            <Option
              option={option}
              conditioning={run.conditioning}
              onPick={() => chooseEvent(i as 0 | 1)}
            />
          </div>
        ))}
      </div>

      <p className="mt-8 font-mono text-[9px] uppercase tracking-[0.2em] text-hash">
        one or the other — there is no third way through the week
      </p>
    </div>
  )
}
