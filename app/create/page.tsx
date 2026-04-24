import profileIcons from '@/data/profileIcons'
import AccountRedirect from '@/lib/accountRedirect'
import { completeOnboarding } from './actions'
import CreateProfileForm from './CreateProfileForm'

export default async function Page() {
  await AccountRedirect('/create')

  return (
    <div className="min-h-dvh box-border bg-[radial-gradient(circle_at_top_left,rgba(255,179,71,0.35),transparent_30%),linear-gradient(180deg,#fff8ef_0%,#ffe4bd_100%)] px-6 py-6 lg:h-dvh lg:overflow-hidden lg:px-8 lg:py-8">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-8 lg:h-full lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
        <section className="rounded-4xl border border-white/60 bg-white/70 p-8 shadow-[0_24px_80px_rgba(115,66,0,0.12)] backdrop-blur lg:h-full">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-700">
            First-time setup
          </p>
          <h1 className="mt-4 font-serif text-4xl text-stone-900">Create your in-game profile</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-stone-700">
            Pick the name, tag, and avatar that will represent you across the site. You can change
            them later in settings, but this step is required before you can enter the app.
          </p>
          <div className="mt-8 space-y-4 rounded-3xl bg-orange-50 p-6 text-sm text-stone-700">
            <p>Your profile must respect these rules:</p>
            <ul className="space-y-2">
              <li>Name: required, max 32 characters.</li>
              <li>Tag: required, max 5 characters, uppercase letters and numbers only.</li>
              <li>Avatar: choose one icon from the available library.</li>
            </ul>
          </div>
        </section>

        <CreateProfileForm icons={profileIcons} action={completeOnboarding} />
      </div>
    </div>
  )
}
