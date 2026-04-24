import Link from 'next/link'
import { RiGamepadLine } from 'react-icons/ri'

const games = [
  {
    href: '/TicTacToe',
    name: 'TicTacToe',
    background:
      'linear-gradient(135deg, rgba(249,115,22,0.18) 0%, rgba(255,247,223,0.88) 45%, rgba(255,255,255,0.96) 100%)',
  },
]

export default async function Games() {
  return (
    <section>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {games.map(game => (
          <Link
            key={game.href}
            href={game.href}
            className="group relative overflow-hidden rounded-4xl border border-orange-200 bg-white shadow-[0_24px_80px_rgba(115,66,0,0.08)] transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_28px_90px_rgba(249,115,22,0.14)]"
            style={{ backgroundImage: game.background }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.14)_100%)]" />
            <div className="relative flex min-h-80 flex-col justify-between p-7 lg:p-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/85 text-orange-500 shadow-[0_14px_30px_rgba(249,115,22,0.18)] backdrop-blur-sm">
                <RiGamepadLine className="h-7 w-7" />
              </div>

              <div>
                <h2 className="text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-[2.7rem]">
                  {game.name}
                </h2>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
