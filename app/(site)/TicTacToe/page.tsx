import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import TicTacToeMatch from '@/components/TicTacToeMatch'
import { getMatchSnapshot } from '@/lib/matches'

export default async function TicTacToeLobbyPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/api/auth/signin')
  }

  const resolvedSearchParams = await searchParams
  const matchId = resolvedSearchParams.match
  const match = matchId ? await getMatchSnapshot(matchId, session.user.id).catch(() => null) : null

  return match ? (
    <TicTacToeMatch initialMatch={match} currentUserId={session.user.id} />
  ) : (
    <section>
      <div className="rounded-4xl border border-orange-100 bg-white p-8 shadow-[0_24px_80px_rgba(115,66,0,0.08)] lg:p-10">
        <h2 className="text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
          No active match selected.
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
          Open a lobby from /games, fill the party, then start the match to land here with a valid
          shared TicTacToe session.
        </p>
        <div className="mt-10 rounded-4xl border border-orange-200 bg-orange-50 p-6 text-sm leading-7 text-stone-600 shadow-[0_16px_40px_rgba(249,115,22,0.12)]">
          This page expects a valid `match` id in the URL. Once the lobby starts, every move will
          sync live to all participants.
        </div>
      </div>
    </section>
  )
}
