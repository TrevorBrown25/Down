# Down

A football roguelike deckbuilder. You declare personnel, they match it, and only
then do you pick the play — the whole game hangs off that one commitment.

## Commands

```bash
npm run dev      # vite dev server
npm test         # vitest — game logic, rules, engine, balance
npm run sim      # print the balance matrix
npm run build    # tsc -b && vite build
```

## Architecture

The one rule that matters: **`src/game/` never imports from `src/ui/`.** The game
is pure TypeScript with no React, no DOM, and no `Math.random()` anywhere. That is
what lets `src/sim/` play tens of thousands of games headlessly in under a second,
and what will let the whole thing be retuned in year two without touching a
component.

```
src/
  game/          pure logic — no React, no globals, no ambient randomness
    rng.ts       seeded mulberry32 + shuffle/pick/weighted
    cards.ts     formations, plays, coverages, deck archetypes
    opponents.ts opponents as data: a matching policy plus rules with hooks
    resolve.ts   the physics layer — run and pass outcomes
    snap.ts      one snap end to end: pre-snap rules → physics → chips → post-snap rules
    engine.ts    the state machine: downs, drives, possessions, scoring
  sim/           headless balance harness, runs under vitest
    policy.ts    pluggable AI policies used as ablations
    play.ts      plays a game to completion, aggregates results
  ui/            React lives here and nowhere else
```

### Randomness

Every random draw goes through an injected `Rng`. Nothing calls `Math.random()`.
This buys reproducible bug reports, daily challenges, run sharing, and a sim
whose results are exact rather than approximate.

### Adding an opponent

An opponent is a matching policy, a coverage preference, and a handful of rules.
Rules are hooks, not `if` branches in the resolver:

- `preSnap` bends the pre-snap picture (box count, charge)
- `postSnap` overrides the outcome after the physics have rolled

Return `null` when the rule doesn't apply; anything else counts as fired, which is
what reveals a hidden rule to the player.

## Testing

Two kinds of test live here, and they are not the same thing:

- **Specs** (`rng`, `engine`) were written first, watched fail, then implemented.
- **Characterization tests** (`cards`, `snap`, `balance`) pin behaviour that was
  ported from the working prototype. They exist so an accidental change shows up
  as a diff. They are not a statement that the current numbers are correct.

`src/sim/balance.test.ts` pins the measured win rate of every deck×opponent
matchup. When a deliberate tuning change moves those numbers, update the table on
purpose.

## Balance

Measured, not guessed — run `npm run sim`. Nine policies play every matchup:

| policy | what it represents |
| --- | --- |
| `random` | the floor — no thought at all |
| `coach` | reads down and distance, has not scouted the opponent |
| `go-for-it` | the coach, but never surrenders a possession |
| `grinder` | a player who has learned The Shell's counter |
| `chips` | the coach, spending chips situationally |
| `informed` | the coach, buying and using coverage reads |
| `oracle` | perfect free coverage knowledge — isolates the value of information |
| `anti-oracle` | perfect knowledge used to pick the *worst* play — the control |
| `veteran` | chips, reads and the flag together |

`src/sim/season.test.ts` plays **whole seasons** with drafting, which is the only
number that means what it says: a chip-spending player completes **32%** of them.

Policies are ablations. Each one changes exactly one thing against the `coach`
baseline, so the delta is the value of that mechanic. `anti-oracle` exists so a
null result can be trusted: if choosing badly with perfect information were not
clearly worse, a flat `oracle` would only prove the scorer was noise.

Measured value, mean win-rate delta vs `coach` over all nine matchups:

| mechanic | delta |
| --- | --- |
| chips | **+10pp** |
| chips + challenge flag | **+15pp** |
| Quick Count (`quick-count`) | +2pp |
| Audible (`audible`) | +1pp |
| coverage reads (`informed`) | 0pp |
| perfect free coverage (`oracle`) | **+5pp** |
| perfect knowledge, worst choice | −18pp |

To an EV-maximising caller who cannot be outplayed anywhere else, knowing the
coverage rather than only the package is worth **+8.2pp** — see
`src/sim/decision.test.ts`.

### Settled

- **Steel Curtain** ran 89% against Air Raid. `No Deep Help` now closes after it
  burns them twice, and Cover 1 Blitz dropped from 60% of their calls to ~33%.
  Now 69%.
- **Punt and field goal** were strictly dominated — a 42-yarder made 42% *and*
  cost you the drive, in a game with only five. The kicker is now roughly
  real-world and neither policy dominates the other, which is pinned as a test.
- **Air Raid** carries a real inside-zone package out of 12 personnel, so it can
  execute the answer to a two-deep shell instead of just losing to it.
- **Coverages now differ in what they do, not just their label.** Each has an
  `underneath` rating alongside `deepHelp`, and the resolver picks which applies
  from the route's depth — so Cover 3 stops the run and the bomb while
  surrendering the quick game, which is the trade it is supposed to make. Passes
  got real man/zone identities to match (`Quick Pass +2` through
  `Play Action −2`) instead of three of five sharing the same value. This took a
  coverage read from worthless to **+8.2pp**, and dragged The Shell up from 6–7%
  to 22–23% against passing decks as a side effect.

### The roster

Nine opponents across three tiers. A season draws two tier-1 weeks, three tier-2
and three tier-3, without replacement, so you rarely face the same team twice.

| tier | weeks | rules each | teams |
| --- | --- | --- | --- |
| 1 warm-up | 1-2 | 2 | The Sandlot · The Rotation · The Overload |
| 2 contender | 3-5 | 3 | The Foundry · The Shell · The Gamblers |
| 3 title shot | 6-8 | 4 | The Mirror · The Vice · The Closer |

Every new opponent carries at least one rule that **changes state mid-game** —
they wear down, they wake up, they adjust to what you keep calling — rather than
being a flat gift or tax. `SnapContext` now carries `lastPlayName`, so a rule can
react to what you called on the previous snap.

Difficulty is pinned as **tier averages**, not as 27 individual cells: what
matters is that the ramp holds its shape.

### Open

1. **Drafting currently makes you worse.** Measured over whole seasons: taking a
   card after every game moves Ground & Pound 16% → 19%, Pro Style 26% → 24%, and
   Air Raid 7% → **4%**. The placeholder draft pool offers existing plays in
   formations you lack, and diluting a lean 16-card deck to 21 costs more
   consistency than those cards add. Authoring real play types is now the most
   valuable content work available, and it has a measurable target: drafting
   should be clearly positive.

2. **Reads are priced at exactly break-even.** Knowing the coverage is now worth
   **+5pp**, but buying that knowledge with a Motion or a Hot Read nets **0pp** —
   the card it costs is worth about what the read gains. That is a defensible
   price rather than a dead card, and it varies by matchup (best +7pp, worst
   −8pp), so it is a real decision. Whether it should be slightly *profitable*
   is a design call. The same is true of the Audible at +2pp.

2. **Air Raid is stuck at 15% against The Shell.** Every other style/opponent
   pair now sits between 41% and 84%; this one cell is the outlier, and it is
   what holds Air Raid's season completion down to 24% while the other two clear
   40%. The counter to a two-deep shell is to get heavy and pound it, and Air
   Raid is the one deck built not to.
3. **Rules are still mostly one-way valves.** Each is a pure gift or a pure tax
   rather than a decision. `Gasses Out` and the new `No Deep Help` expiry are the
   only two that change state mid-game, and they are the most interesting rules
   in the build.
4. **Air Raid completes only 21% of seasons** against 39% and 37% for the other
   two, almost all of it the 15% against The Shell. That matchup is correct by
   design — a pass-first team should lose to a two-deep shell — but with only two
   losses allowed, one conceded cell is expensive.
