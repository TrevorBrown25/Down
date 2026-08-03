import { useGame } from './ui/store'
import { Pregame } from './ui/Pregame'
import { Season } from './ui/Season'
import { Draft } from './ui/Draft'
import { RunOver } from './ui/RunOver'
import { Table } from './ui/Table'

export default function App() {
  const { run, game } = useGame()

  const view = () => {
    if (!run) return <Pregame />
    if (game) return <Table game={game} />
    if (run.status !== 'playing') return <RunOver run={run} />
    if (run.pending) return <Draft run={run} />
    return <Season run={run} />
  }

  return <div className="chalkboard chalk-smear min-h-screen">{view()}</div>
}
