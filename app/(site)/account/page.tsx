import Image from 'next/image'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import profileIcons from '@/data/profileIcons'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AccountProfileForm from './AccountProfileForm'
import CopyPlayerIdButton from './CopyPlayerIdButton'
import { deleteAccount, updateAccountAvatar, updateAccountIdentity } from './actions'

export default async function AccountPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login')
  }

  const profile = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      inGameName: true,
      tag: true,
      avatarUrl: true,
      email: true,
      onboardingCompleted: true,
    },
  })

  const displayName = profile?.inGameName || session.user.name || 'Player'
  const displayTag = profile?.tag ? `#${profile.tag}` : 'READY'
  const avatarSrc = profile?.avatarUrl || '/images/profile_icons/fox.png'
  const playerId = `${displayName}${profile?.tag ? `#${profile.tag}` : ''}`

  return (
    <section className="flex h-full overflow-hidden items-center">
      <div className="grid h-full w-full gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
        <div className="h-full rounded-4xl border border-orange-100 bg-white p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-600">
            Account
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-stone-900">
            Edit your player identity.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-8 text-stone-600">
            Keep your public profile sharp with a better in-game name, a clean uppercase tag, and
            the avatar that fits you best.
          </p>

          <div className="mt-8 rounded-4xl border border-orange-100 bg-orange-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-600">
              Current profile
            </p>
            <div className="mt-4 flex items-center gap-4 rounded-3xl bg-white px-5 py-4 shadow-sm">
              <div className="border-orange-100 bg-orange-50 rounded-full border">
                <Image
                  src={avatarSrc}
                  alt={`${displayName} avatar`}
                  width={72}
                  height={72}
                  className="h-18 w-18 object-cover p-2.5"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xl font-semibold text-stone-900">{displayName}</p>
                <p className="mt-1 text-sm font-medium uppercase tracking-[0.18em] text-orange-600">
                  {displayTag}
                </p>
                <p className="mt-3 truncate text-xs text-stone-500">
                  {profile?.email || 'No email'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex-col items-center justify-between rounded-3xl border border-orange-100 bg-white px-5 py-4">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-400">
                Shareable player ID
              </p>
              <div className="min-w-0 flex space-between items-center gap-4 mt-3">
                <p className="mt-2 truncate text-lg font-semibold text-stone-900">{playerId}</p>
                <CopyPlayerIdButton playerId={playerId} />
              </div>
            </div>
          </div>
        </div>

        <AccountProfileForm
          key={`${avatarSrc}:${profile?.inGameName || ''}:${profile?.tag || ''}`}
          currentAvatarUrl={avatarSrc}
          currentInGameName={profile?.inGameName || ''}
          currentTag={profile?.tag || ''}
          deleteAction={deleteAccount}
          identityAction={updateAccountIdentity}
          icons={profileIcons}
          updateAvatarAction={updateAccountAvatar}
        />
      </div>
    </section>
  )
}
