import Link from 'next/link'
import { HiOutlineArrowLeft, HiOutlineSparkles } from 'react-icons/hi2'
import { RiGamepadLine, RiSwordLine, RiTeamLine } from 'react-icons/ri'
import TicTacToeLobbyAutoJoin from '@/components/TicTacToeLobbyAutoJoin'

export default function TicTacToeLobbyPage() {
  return (
    <section className="space-y-8">
      <TicTacToeLobbyAutoJoin />

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-600">
            Game lobby
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-stone-950 sm:text-6xl">
            TicTacToe
          </h1>
        </div>

        <Link
          href="/games"
          className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition hover:border-orange-300 hover:text-orange-600"
        >
          <HiOutlineArrowLeft className="h-4 w-4" />
          Back to games
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.06fr_0.94fr]">
        <div className="rounded-4xl border border-orange-100 bg-white p-8 shadow-[0_24px_80px_rgba(115,66,0,0.08)] lg:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700">
            <HiOutlineSparkles className="h-4 w-4" />
            Lobby preview
          </div>

          <h2 className="mt-8 text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
            Choose how you want to enter the match.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
            This is the first version of the TicTacToe lobby. Matchmaking and friend invites are
            visible in the interface now, and automatic invite join is already wired so the real
            matchmaking connector can plug into these entry points next.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-4xl border border-orange-200 bg-orange-50 p-6 text-left shadow-[0_16px_40px_rgba(249,115,22,0.12)] transition hover:border-orange-300 hover:bg-orange-100"
            >
              <RiSwordLine className="h-7 w-7 text-orange-500" />
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.22em] text-orange-600">
                Matchmaking
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-stone-950">Find match</h3>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                Queue into the public lobby and wait for another player.
              </p>
              <span className="mt-6 inline-flex rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700">
                Coming soon
              </span>
            </button>

            <button
              type="button"
              className="rounded-4xl border border-orange-200 bg-white p-6 text-left shadow-[0_16px_40px_rgba(115,66,0,0.08)] transition hover:border-orange-300 hover:bg-orange-50"
            >
              <RiTeamLine className="h-7 w-7 text-orange-500" />
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.22em] text-orange-600">
                Invite friend
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-stone-950">Private room</h3>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                Create a direct lobby for a friend and start a private challenge.
              </p>
              <span className="mt-6 inline-flex rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700">
                Coming soon
              </span>
            </button>
          </div>
        </div>

        <div className="rounded-4xl border border-orange-100 bg-orange-50/80 p-8 shadow-[0_24px_80px_rgba(115,66,0,0.08)] lg:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-[0_16px_30px_rgba(249,115,22,0.3)]">
              <RiGamepadLine className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-600">
                Session info
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-950">Lobby status</h2>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="rounded-3xl border border-orange-100 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                Mode
              </p>
              <p className="mt-2 text-xl font-semibold text-stone-950">Online 1v1</p>
            </div>
            <div className="rounded-3xl border border-orange-100 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                Matchmaking
              </p>
              <p className="mt-2 text-xl font-semibold text-stone-950">Not connected yet</p>
            </div>
            <div className="rounded-3xl border border-orange-100 bg-white px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                Friend invite
              </p>
              <p className="mt-2 text-xl font-semibold text-stone-950">
                Auto-join bridge ready for realtime room sync
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
