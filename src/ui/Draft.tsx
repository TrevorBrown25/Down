import { useState } from 'react'
import { personnelOf, type Card } from '../game/cards'
import { SEASON, type Run } from '../game/run'
import { CardFace } from './CardFace'
import { NextUp } from './NextUp'
import { useGame } from './store'

function CutList({
  run,
  cuts,
  onCut,
}: {
  run: Run
  cuts: number
  onCut: (id: number) => void
}) {
  const [armed, setArmed] = useState(false)
  const atFloor = run.deck.length <= SEASON.minDeck

  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        disabled={atFloor}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-faint underline decoration-hash underline-offset-4 transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
      >
        {atFloor
          ? `call sheet is at its floor of ${SEASON.minDeck}`
          : cuts > 1
            ? `this week bought you ${cuts} cuts — use them`
            : 'or cut a play from the sheet instead'}
      </button>
    )
  }

  const sorted = [...run.deck].sort((a, b) => {
    const key = (c: Card) => (c.type === 'play' ? `${personnelOf(c.form)}${c.play}` : `z${c.name}`)
    return key(a).localeCompare(key(b))
  })

  return (
    <div className="w-full">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-danger">
          {cuts} to cut — a leaner sheet draws its best cards more often
        </span>
        <button
          onClick={() => setArmed(false)}
          className="font-mono text-[9px] uppercase tracking-[0.16em] text-hash hover:text-chalk-dim"
        >
          never mind
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
        {sorted.map((card) => (
          <button
            key={card.id}
            onClick={() => onCut(card.id)}
            className="h-[132px] w-full transition-transform hover:-translate-y-1"
            style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.5))' }}
          >
            <CardFace card={card} />
          </button>
        ))}
      </div>
    </div>
  )
}

export function Draft({ run }: { run: Run }) {
  const { draft, passOnDraft, cut } = useGame()
  const offer = run.pending
  if (!offer) return null

  const last = run.history[run.history.length - 1]

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="reveal">
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-chalk-faint">
          {last?.won ? 'you got it done' : 'you take the loss'} · {run.wins}-{run.losses}
        </div>
        <h2 className="mt-1 font-display text-4xl leading-none tracking-tight text-chalk">
          ADD TO THE CALL SHEET
        </h2>
        <p className="mt-2 font-mono text-[10px] text-chalk-dim">
          Take one, or pass and keep the sheet lean.
        </p>
      </div>

      <div className="mt-8 mb-8">
        <NextUp run={run} />
      </div>

      <div className="flex justify-center gap-4">
        {offer.cards.map((card, i) => (
          <button
            key={card.id}
            onClick={() => draft(card.id)}
            className="reveal h-[196px] w-[138px] transition-transform duration-200 hover:-translate-y-3 hover:scale-[1.06]"
            style={{
              animationDelay: `${100 + i * 80}ms`,
              filter: 'drop-shadow(0 14px 30px rgba(0,0,0,.6))',
            }}
          >
            <CardFace card={card} />
          </button>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-4">
        <button
          onClick={passOnDraft}
          className="rounded-[2px] border border-hash px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-dim transition-colors hover:border-chalk-faint hover:text-chalk"
        >
          pass — take nothing
        </button>

        {offer.cuts > 0 && <CutList run={run} cuts={offer.cuts} onCut={cut} />}
      </div>
    </div>
  )
}
