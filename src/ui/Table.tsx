import { OFF_FORMATIONS, PERSONNEL, type Personnel } from '../game/cards'
import { OPPONENTS } from '../game/opponents'
import { RULES, legalPlays, type ChipAbility, type Game } from '../game/engine'
import { useGame } from './store'
import { Field } from './Field'
import { DEFAULT_FORMATION } from './formations'
import { Hand } from './Hand'
import { DriveLog, Matchup, Scoreboard, Scouting } from './Panels'

function Btn({
  children,
  onClick,
  disabled,
  active,
  tone = 'plain',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
  tone?: 'plain' | 'go' | 'warn'
}) {
  const tones = {
    plain: 'border-hash text-chalk-dim hover:border-chalk-faint hover:text-chalk',
    go: 'border-chip/50 text-chip hover:border-chip hover:bg-chip/10',
    warn: 'border-charge/50 text-charge hover:border-charge hover:bg-charge/10',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[2px] border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-all disabled:cursor-not-allowed disabled:opacity-25 ${
        active ? 'border-charge bg-charge/15 text-charge' : tones[tone]
      }`}
    >
      {children}
    </button>
  )
}

const CHIP_COST: Record<Exclude<ChipAbility, 'quick'>, number> = {
  protect: 1,
  juice: 2,
  fresh: 2,
}

function ChipBar({ game }: { game: Game }) {
  const { arm, hurry } = useGame()
  const armed =
    (game.protectArmed ? 1 : 0) + (game.juiceArmed ? 2 : 0) + (game.freshArmed ? 2 : 0)

  const chip = (
    which: Exclude<ChipAbility, 'quick'>,
    label: string,
    blurb: string,
    on: boolean,
  ) => (
    <button
      onClick={() => arm(which)}
      disabled={!on && armed + CHIP_COST[which] > game.chips}
      className={`group flex flex-col items-start rounded-[2px] border px-3 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-25 ${
        on
          ? 'border-chip bg-chip/12'
          : 'border-hash hover:border-chip/60 hover:bg-chip/[0.06]'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
            on ? 'text-chip' : 'text-chalk-dim'
          }`}
        >
          {label}
        </span>
        <span className="text-[9px] text-chip">{'●'.repeat(CHIP_COST[which])}</span>
      </span>
      <span className="mt-0.5 font-mono text-[8.5px] text-chalk-faint">{blurb}</span>
    </button>
  )

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {chip('protect', 'Max Protect', 'no sack, no turnover', game.protectArmed)}
      {chip('juice', 'Send It', 'explosive chance tripled', game.juiceArmed)}
      {chip('fresh', 'Fresh Legs', '+1 blocker', game.freshArmed)}
      <button
        onClick={hurry}
        disabled={game.chips < 1}
        className="flex flex-col items-start rounded-[2px] border border-hash px-3 py-2 text-left transition-all hover:border-skill/60 hover:bg-skill/[0.06] disabled:cursor-not-allowed disabled:opacity-25"
      >
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-chalk-dim">
            Hurry-Up
          </span>
          <span className="text-[9px] text-chip">●</span>
        </span>
        <span className="mt-0.5 font-mono text-[8.5px] text-chalk-faint">draw a card now</span>
      </button>
    </div>
  )
}

function PersonnelChoice({ game }: { game: Game }) {
  const declare = useGame((s) => s.declare)
  return (
    <div>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-chalk-faint">
        send out your personnel
        <span className="ml-2 normal-case tracking-normal text-hash">
          — they see this and match. your play stays hidden.
        </span>
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {game.groupsInHand.map((group: Personnel, i) => {
          const plays = game.hand.filter(
            (c) => c.type === 'play' && OFF_FORMATIONS[c.form].pers === group,
          )
          return (
            <button
              key={group}
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => declare(group)}
              className="reveal group rounded-[2px] border border-hash bg-board-deep/60 p-3 text-left transition-all hover:border-skill hover:bg-skill/[0.07]"
            >
              <div className="font-display text-2xl leading-none tracking-wide text-chalk transition-colors group-hover:text-skill">
                {group}
              </div>
              <div className="mt-1 font-mono text-[9px] text-chalk-faint">
                {PERSONNEL[group].label}
              </div>
              <div className="mt-2 font-mono text-[9px] leading-relaxed text-chalk-dim">
                {plays.map((c) => (c.type === 'play' ? c.play : '')).join(' · ')}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Table({ game }: { game: Game }) {
  const store = useGame()
  const opponent = OPPONENTS[game.opponentName]
  const showResult = game.phase === 'result' && game.lastSnap
  const fgDist = 100 - game.ballOn + 17
  const callable = game.phase === 'call' && legalPlays(game).length > 0

  if (game.phase === 'over') {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-chalk-faint">
          final
        </div>
        <div
          className="font-display text-8xl leading-none tracking-tight"
          style={{ color: game.won ? 'var(--color-chip)' : 'var(--color-danger)' }}
        >
          {game.won ? 'WIN' : 'LOSS'}
        </div>
        <div className="font-display text-3xl text-chalk-dim">
          {game.points} — {RULES.target}
        </div>
        <p className="max-w-md font-mono text-[11px] leading-relaxed text-chalk-faint">
          {game.won
            ? `You got there against ${game.opponentName}.`
            : `${game.opponentName} held you to ${game.points}.`}{' '}
          You uncovered {Object.keys(game.revealed).length} of their hidden tendencies.
        </p>
        <Btn onClick={store.finishWeek} tone="go">
          back to the schedule →
        </Btn>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-[1180px] gap-3 px-5 py-3 lg:grid-cols-[1fr_290px]">
      <div className="space-y-2.5">
        <Scoreboard game={game} />

        <Field
          formation={
            game.lastCall?.form ?? (game.declared ? DEFAULT_FORMATION[game.declared] : null)
          }
          defFormation={game.defForm}
          result={showResult && game.lastSnap ? game.lastSnap.result : null}
          ballOn={game.ballOn}
          toGo={game.toGo}
        />

        {game.notice && (
          <div className="rounded-[2px] border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
            {game.notice}
          </div>
        )}

        {game.phase !== 'personnel' && <Matchup game={game} />}

        {game.phase === 'personnel' && <PersonnelChoice game={game} />}

        {game.phase === 'call' && (
          <div className="space-y-3">
            <ChipBar game={game} />
            {!callable && (
              <div className="rounded-[2px] border border-danger/40 px-3 py-2 font-mono text-[10px] text-danger">
                no legal play in {game.declared} personnel — audible, or toss for a redraw.
              </div>
            )}
            {game.down === 4 && (
              <div className="flex gap-2">
                <Btn onClick={store.punt} tone="warn">
                  punt
                </Btn>
                {fgDist <= 58 && (
                  <Btn onClick={store.kick} tone="warn">
                    field goal · {fgDist} yds
                  </Btn>
                )}
              </div>
            )}
          </div>
        )}

        {showResult && game.lastSnap && (
          <div className="space-y-3">
            <div className="tape rounded-[2px] px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-chalk-faint">
                {game.declared} · {game.lastCall?.form} / {game.lastCall?.play}
              </div>
              {game.lastSnap.chargeUsed > 0 && (
                <div className="mt-1.5 font-mono text-[10px] text-charge">
                  they bit — play action cashed ◆{game.lastSnap.chargeUsed}
                </div>
              )}
              {game.lastSnap.result.protected && (
                <div className="mt-1.5 font-mono text-[10px] text-chip">
                  ● max protect absorbed it
                </div>
              )}
              {game.disguised && game.known && (
                <div className="mt-1.5 font-mono text-[10px] text-danger">
                  disguise — your motion read was a lie
                </div>
              )}
              {game.lastSnap.fired.map((key) => (
                <div key={key} className="mt-1.5 font-mono text-[10px] text-charge">
                  ⚑ {opponent.rules[key]?.name} — {opponent.rules[key]?.text}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Btn onClick={store.advance} tone="go">
                next down →
              </Btn>
              {!game.challengeUsed && (
                <Btn onClick={store.flag} tone="warn">
                  ⚑ challenge · reroll once per game
                </Btn>
              )}
            </div>
          </div>
        )}

        <Hand
          game={game}
          playable={game.phase === 'call'}
          onCall={store.call}
          onToss={store.toss}
          onRead={store.read}
          onAudible={store.audible}
          onArmQuick={() => store.arm('quick')}
        />
      </div>

      <aside className="space-y-3">
        <Scouting game={game} />
        <DriveLog game={game} />
        <div className="flex items-center justify-between px-1">
          <span className="font-mono text-[9px] text-hash">
            deck {game.deck.length} · discard {game.discard.length}
          </span>
          <button
            onClick={store.abandon}
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-hash transition-colors hover:text-danger"
          >
            abandon season
          </button>
        </div>
      </aside>
    </div>
  )
}
