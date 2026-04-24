import Image from 'next/image'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { HiOutlineSparkles } from 'react-icons/hi2'
import { RiGamepadLine, RiUserLine } from 'react-icons/ri'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Friends from './Friends'
import GoogleLogBtn from './GoogleLogBtn'
import LogoutBtn from './LogoutBtn'

export default async function NavBar() {
  const session = await getServerSession(authOptions)

  const profile = session?.user?.id
    ? await prisma.user.findUnique({
        where: {
          id: session.user.id,
        },
        select: {
          inGameName: true,
          tag: true,
          avatarUrl: true,
        },
      })
    : null

  const displayName = profile?.inGameName || session?.user?.name || 'Player'
  const rawTag = profile?.tag || 'READY'
  const displayTag = `#${rawTag}`
  const avatarSrc = profile?.avatarUrl || session?.user?.image || '/images/profile_icons/fox.png'

  return (
    <header className="sticky top-0 z-50 border-b border-orange-100/80 bg-white/90 backdrop-blur-xl">
      <nav className="mx-auto flex min-h-22 w-full max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 text-stone-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-[0_14px_30px_rgba(249,115,22,0.28)]">
            <HiOutlineSparkles className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-orange-600">
              Game Hub
            </p>
            <p className="text-lg font-semibold text-stone-900">Player lounge</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {session ? (
            <>
              <div className="hidden items-center gap-2 rounded-full border border-orange-100 bg-orange-50 p-1 pr-4 sm:flex">
                <div className="rounded-full bg-white shadow-sm flex items-center justify-center h-10 w-10">
                  <Image
                    src={avatarSrc}
                    alt={`${displayName} avatar`}
                    width={64}
                    height={64}
                    className="object-cover p-1 "
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-900">{displayName}</p>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-orange-600">
                    {displayTag}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50/80 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <Link
                  href="/games"
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-white hover:text-orange-600"
                >
                  <RiGamepadLine className="h-4 w-4" />
                  <span>Games</span>
                </Link>
                <Friends inGameName={displayName} tag={rawTag} />
                <Link
                  href="/account"
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-white hover:text-orange-600"
                >
                  <RiUserLine className="h-4 w-4" />
                  <span>Account</span>
                </Link>
                <LogoutBtn />
              </div>
            </>
          ) : (
            <GoogleLogBtn />
          )}
        </div>
      </nav>
    </header>
  )
}
