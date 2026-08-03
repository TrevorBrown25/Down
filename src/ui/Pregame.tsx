import { useState } from 'react'
import { OFF_PLAYS, STARTERS, starterDeck, type StyleName } from '../game/cards'
import { SEASON } from '../game/run'
import { useGame } from './store'

export function Pregame() {
  const startRun = useGame((s) => s.startRun)
  const [picked, setPicked] = useState<StyleName | null>(null)

  return (
    <div className="chalkboard chalk-smear min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="reveal mb-14">
          <h1 className="font-display text-[clamp(4rem,13vw,9rem)] leading-[0.82] tracking-tight text-chalk">
            DOWN
          </h1>
          <p className="mt-3 max-w-md font-mono text-[11px] leading-relaxed text-chalk-dim">
            You declare personnel. They match it. Only then do you call the play.
          </p>
        </div>

        <div className="reveal tape mb-8 rounded-sm px-5 py-4" style={{ animationDelay: '90ms' }}>
          <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-chalk-faint">
            the season ahead
          </div>
          <div className="mt-3 grid gap-x-10 gap-y-2.5 font-mono text-[10px] leading-relaxed text-chalk-dim sm:grid-cols-2">
            <div>
              <span className="text-charge">{SEASON.games} games</span> — the whole schedule is
              visible from week one, so you draft for who is coming.
            </div>
            <div>
              <span className="text-danger">
                {SEASON.lossesAllowed} losses survivable
              </span>{' '}
              — the third ends your season on the spot.
            </div>
            <div>
              <span className="text-skill">A card after every game</span> — take one of three, or
              keep the sheet lean.
            </div>
            <div>
              <span className="text-chalk">Every opponent hides two tendencies.</span> You find
              them by running into them.
            </div>
          </div>
        </div>

        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-chalk-faint">
          choose your identity
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(STARTERS) as StyleName[]).map((name, i) => {
            const deck = starterDeck(name)
            const counts: Record<string, number> = {}
            let runs = 0
            let passes = 0
            for (const card of deck) {
              if (card.type !== 'play') continue
              counts[card.play] = (counts[card.play] ?? 0) + 1
              if (OFF_PLAYS[card.play].kind === 'run') runs++
              else passes++
            }
            const adjustments = deck.length - runs - passes
            const on = picked === name
            return (
              <button
                key={name}
                style={{ animationDelay: `${170 + i * 70}ms` }}
                onMouseEnter={() => setPicked(name)}
                onClick={() => startRun(name)}
                className={`reveal flex flex-col rounded-sm border p-4 text-left transition-all ${
                  on
                    ? 'border-charge bg-charge/[0.07]'
                    : 'border-hash bg-board-deep/50 hover:border-chalk-faint'
                }`}
              >
                <div className="font-display text-2xl leading-tight tracking-wide text-chalk">
                  {name.toUpperCase()}
                </div>
                <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-chalk-dim">
                  {STARTERS[name].blurb}
                </p>

                <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-charge">
                  {STARTERS[name].identity}
                </p>

                <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-board-edge">
                  <div className="bg-chip" style={{ width: `${(runs / deck.length) * 100}%` }} />
                  <div className="bg-skill" style={{ width: `${(passes / deck.length) * 100}%` }} />
                  <div className="bg-charge" style={{ width: `${(adjustments / deck.length) * 100}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[9px] text-chalk-faint">
                  <span className="text-chip">{runs} run</span>
                  <span className="text-skill">{passes} pass</span>
                  <span className="text-charge">{adjustments} adj</span>
                </div>

                <div className="mt-3 font-mono text-[8.5px] leading-relaxed text-hash">
                  {Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([p, n]) => `${p} ×${n}`)
                    .join(' · ')}
                </div>
              </button>
            )
          })}
        </div>

        <p className="mt-8 font-mono text-[9px] uppercase tracking-[0.2em] text-hash">
          16 cards · 17 points a game · 5 drives · click a style to begin the season
        </p>
      </div>
    </div>
  )
}
