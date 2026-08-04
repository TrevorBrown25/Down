import { useState } from 'react'
import { SEASON } from '../game/run'
import { read } from './storage'
import { useGame } from './store'

/** What the save on disk actually holds, for the continue line. */
function savedLine(): string | null {
  const found = read()
  if (!found.ok) return null
  const { run, game } = found.save
  const week = Math.min(run.at + 1, SEASON.games)
  return (
    `${run.style} · ${run.wins}-${run.losses} · week ${week} of ${SEASON.games}` +
    (game ? ` · mid-game vs ${game.opponentName}` : '')
  )
}

export function Menu() {
  const { resumable, resume, discardSave } = useGame()
  const newRun = useGame((s) => s.newRunFlow)
  const [confirming, setConfirming] = useState(false)
  const saved = resumable ? savedLine() : null

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="reveal">
        <h1 className="font-display text-[clamp(4rem,18vw,10rem)] leading-[0.82] tracking-tight text-chalk">
          DOWN
        </h1>
        <p className="mt-4 max-w-md font-mono text-[12px] leading-relaxed text-chalk-dim">
          You declare personnel. They match it. Only then do you call the play.
        </p>
      </div>

      <div className="reveal mt-14 flex flex-col items-start gap-3" style={{ animationDelay: '120ms' }}>
        {saved && (
          <button
            onClick={resume}
            className="group w-full max-w-lg rounded-sm border border-chip/50 bg-chip/[0.06] px-5 py-4 text-left transition-all hover:border-chip hover:bg-chip/[0.12]"
          >
            <div className="font-display text-3xl leading-none tracking-wide text-chip">
              CONTINUE
            </div>
            <div className="mt-1.5 font-mono text-[10px] text-chalk-dim">{saved}</div>
          </button>
        )}

        <button
          onClick={() => (saved ? setConfirming(true) : newRun())}
          className="group w-full max-w-lg rounded-sm border border-hash px-5 py-4 text-left transition-all hover:border-skill hover:bg-skill/[0.07]"
        >
          <div className="font-display text-3xl leading-none tracking-wide text-chalk transition-colors group-hover:text-skill">
            NEW SEASON
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-chalk-dim">
            {SEASON.games} games · {SEASON.lossesAllowed} losses survivable · the third ends it
          </div>
        </button>

        {confirming && (
          <div className="w-full max-w-lg rounded-sm border border-danger/50 bg-danger/[0.07] px-5 py-4">
            <div className="font-mono text-[11px] leading-relaxed text-danger">
              Starting a new season overwrites the run in progress. There is only one slot.
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  discardSave()
                  newRun()
                }}
                className="rounded-[2px] border border-danger/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-danger transition-colors hover:bg-danger/15"
              >
                overwrite it
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-[2px] border border-hash px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-chalk-dim transition-colors hover:text-chalk"
              >
                keep it
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        className="reveal mt-16 font-mono text-[9px] uppercase tracking-[0.22em] text-hash"
        style={{ animationDelay: '240ms' }}
      >
        your season saves itself after every snap
      </div>
    </div>
  )
}
