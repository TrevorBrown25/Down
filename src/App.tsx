import { useGame } from './ui/store'
import { Pregame } from './ui/Pregame'
import { Table } from './ui/Table'

export default function App() {
  const game = useGame((s) => s.game)
  if (!game) return <Pregame />
  return (
    <div className="chalkboard chalk-smear min-h-screen">
      <Table game={game} />
    </div>
  )
}
