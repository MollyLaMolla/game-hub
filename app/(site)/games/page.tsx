import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import GamesLobby from '../../../components/GamesLobby'
import { authOptions } from '@/lib/auth'
import { getOrCreateLobbySnapshot } from '@/lib/lobbies'

export default async function GamesPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/api/auth/signin')
  }

  const initialLobby = await getOrCreateLobbySnapshot(session.user.id)

  return <GamesLobby initialLobby={initialLobby} currentUserId={session.user.id} />
}
