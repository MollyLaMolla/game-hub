'use client'

import Image from 'next/image'
import { useActionState, useState } from 'react'
import type { ProfileIconOption } from '@/data/profileIcons'
import type { CreateProfileFormState } from './actions'

function SubmitButton() {
  return (
    <button
      type="submit"
      className="inline-flex w-full items-center justify-center rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
    >
      Save profile
    </button>
  )
}

export default function CreateProfileForm({
  icons,
  action,
}: {
  icons: ProfileIconOption[]
  action: (state: CreateProfileFormState, formData: FormData) => Promise<CreateProfileFormState>
}) {
  const initialState: CreateProfileFormState = { fieldErrors: {} }
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [selectedIcon, setSelectedIcon] = useState(icons[0]?.src ?? '')
  const [tag, setTag] = useState('')

  return (
    <section className="rounded-4xl border border-stone-200 bg-white p-8 shadow-[0_24px_80px_rgba(115,66,0,0.12)] lg:h-full lg:min-h-0 lg:overflow-hidden">
      <form
        action={formAction}
        className="space-y-8 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:space-y-0 lg:overflow-hidden"
      >
        <div className="space-y-2">
          <label htmlFor="inGameName" className="text-sm font-medium text-stone-800">
            In-game name
          </label>
          <input
            id="inGameName"
            name="inGameName"
            type="text"
            maxLength={32}
            required
            autoComplete="off"
            placeholder="Player123"
            className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 outline-none transition focus:border-orange-500 focus:bg-white"
          />
          <p className="text-xs text-stone-500">Up to 32 characters.</p>
          {state.fieldErrors?.inGameName ? (
            <p className="text-sm text-red-600">{state.fieldErrors.inGameName}</p>
          ) : null}
        </div>

        <div className="space-y-2 lg:mt-8">
          <label htmlFor="tag" className="text-sm font-medium text-stone-800">
            Tag
          </label>
          <input
            id="tag"
            name="tag"
            type="text"
            maxLength={5}
            required
            autoComplete="off"
            placeholder="EUW1"
            value={tag}
            onChange={event => {
              const nextValue = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
              setTag(nextValue.slice(0, 5))
            }}
            className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 uppercase outline-none transition focus:border-orange-500 focus:bg-white"
          />
          <p className="text-xs text-stone-500">Uppercase letters and numbers only, max 5.</p>
          {state.fieldErrors?.tag ? (
            <p className="text-sm text-red-600">{state.fieldErrors.tag}</p>
          ) : null}
        </div>

        <div className="space-y-3 lg:mt-8 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <div>
            <p className="text-sm font-medium text-stone-800">Profile icon</p>
            <p className="text-xs text-stone-500">Choose one avatar for your public profile.</p>
          </div>
          <input type="hidden" name="avatarUrl" value={selectedIcon} />
          <div className="grid max-h-108 grid-cols-4 gap-3 overflow-y-auto pr-1 sm:grid-cols-5 lg:min-h-0 lg:flex-1 lg:grid-cols-4 xl:grid-cols-5">
            {icons.map(icon => {
              const isSelected = selectedIcon === icon.src

              return (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() => setSelectedIcon(icon.src)}
                  className={`rounded-2xl border p-2 transition ${
                    isSelected
                      ? 'border-orange-500 bg-orange-100 shadow-[0_0_0_2px_rgba(249,115,22,0.2)]'
                      : 'border-stone-200 bg-stone-50 hover:border-orange-300 hover:bg-orange-50'
                  }`}
                  aria-pressed={isSelected}
                  aria-label={`Select ${icon.alt}`}
                >
                  <Image
                    src={icon.src}
                    alt={icon.alt}
                    width={64}
                    height={64}
                    className="mx-auto h-14 w-14 rounded-full object-cover"
                  />
                </button>
              )
            })}
          </div>
          {state.fieldErrors?.avatarUrl ? (
            <p className="text-sm text-red-600">{state.fieldErrors.avatarUrl}</p>
          ) : null}
        </div>

        {state.formError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 lg:mt-6 lg:shrink-0">
            {state.formError}
          </div>
        ) : null}

        <div className="flex items-end justify-between gap-4 lg:mt-6 lg:shrink-0">
          <p className="text-xs text-stone-500">
            Your profile is stored only after validation succeeds.
          </p>
          <div className="w-full max-w-56">
            <SubmitButton />
          </div>
        </div>

        {isPending ? (
          <p className="text-sm text-stone-500 lg:mt-4 lg:shrink-0">Saving your profile...</p>
        ) : null}
      </form>
    </section>
  )
}
