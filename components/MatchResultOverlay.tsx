'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import { HiOutlineChevronDown } from 'react-icons/hi2'
import type { FriendIdentity } from '@/lib/friends-shared'

type OverlayAction = {
  key: string
  label: string
  busyLabel?: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  tone?: 'primary' | 'secondary'
}

type OverlayStat = {
  label: string
  value: ReactNode
  tone?: 'amber' | 'stone'
}

type Props = {
  outcome: 'victory' | 'defeat' | 'draw'
  winnerPlayers: FriendIdentity[]
  winnerLabel: string
  stats: OverlayStat[]
  actions: OverlayAction[]
  onClose: () => void
}

const outcomeLabelMap = {
  victory: 'VICTORY',
  defeat: 'DEFEAT',
  draw: 'DRAW',
} as const

export default function MatchResultOverlay({
  outcome,
  winnerPlayers,
  winnerLabel,
  stats,
  actions,
  onClose,
}: Props) {
  const accentClassName =
    outcome === 'victory'
      ? 'from-amber-100 via-orange-50 to-white text-amber-700'
      : outcome === 'defeat'
        ? 'from-rose-100 via-orange-50 to-white text-rose-700'
        : 'from-sky-100 via-white to-orange-50 text-sky-700'

  const titleClassName =
    outcome === 'victory'
      ? 'text-amber-500'
      : outcome === 'defeat'
        ? 'text-rose-500'
        : 'text-sky-500'

  return (
    <>
      <style jsx global>{`
        @keyframes match-result-overlay-in {
          from {
            opacity: 0;
            transform: translate3d(0, 20px, 0) scale(0.96);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
      `}</style>

      <div
        className="w-full max-w-lg overflow-hidden rounded-4xl border border-stone-200 bg-white/96 shadow-[0_30px_90px_rgba(15,23,42,0.2)] backdrop-blur-md"
        style={{ animation: 'match-result-overlay-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <div
          className={`relative overflow-hidden bg-linear-to-br ${accentClassName} px-5 py-5 sm:px-6`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),transparent_40%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.45),transparent_34%)]" />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-600/75">
                Match complete
              </p>
              <h2
                className={`mt-3 text-4xl font-semibold tracking-tighter sm:text-5xl ${titleClassName}`}
              >
                {outcomeLabelMap[outcome]}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/75 text-stone-500 transition hover:text-stone-950"
              aria-label="Minimize match overlay"
            >
              <HiOutlineChevronDown className="h-5 w-5" />
            </button>
          </div>

          <div className="relative mt-6 flex items-center gap-4 pt-6">
            <div className="flex -space-x-3">
              {winnerPlayers.slice(0, 2).map((player, index) => (
                <div
                  key={player.id}
                  className={`relative rounded-full border-4 border-white bg-white shadow-[0_16px_36px_rgba(15,23,42,0.16)] ${index === 0 ? 'z-2' : 'z-1'}`}
                >
                  {index === 0 ? (
                    <div className="pointer-events-none absolute -top-10 left-[calc(50%+12px)] z-10 w-12 -translate-x-1/2 drop-shadow-[0_18px_24px_rgba(255,153,0,0.28)] sm:w-16 rotate-20">
                      <Image
                        src="/images/winer_crown.png"
                        alt="Winner crown"
                        width={240}
                        height={220}
                        className="h-auto w-full"
                        priority
                      />
                    </div>
                  ) : null}
                  <Image
                    src={player.avatarUrl}
                    alt={`${player.inGameName} avatar`}
                    width={68}
                    height={68}
                    className="h-17 w-17 object-cover p-2"
                  />
                </div>
              ))}
            </div>

            <div className="min-w-0">
              <p className="truncate text-2xl font-semibold tracking-tighter text-stone-950">
                {winnerLabel}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {winnerPlayers.slice(0, 2).map(player => (
                  <span
                    key={player.id}
                    className="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700"
                  >
                    {player.inGameName} #{player.tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-3">
            {stats.map(stat => (
              <div
                key={stat.label}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold ${
                  stat.tone === 'amber'
                    ? 'border-orange-100 bg-orange-50/75 text-stone-700'
                    : 'border-stone-200 bg-stone-50 text-stone-600'
                }`}
              >
                <span>{stat.label}</span>
                <span className="text-base font-semibold text-stone-950 flex">{stat.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {actions.map(action => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled || action.busy}
                className={`inline-flex min-h-13 flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  action.tone === 'secondary'
                    ? 'border border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:text-stone-950'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {action.icon}
                {action.busy ? action.busyLabel || action.label : action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
