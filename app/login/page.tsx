import AccountRedirect from '@/lib/accountRedirect'
import GoogleLogBtn from '@/components/GoogleLogBtn'
import { HiOutlineSparkles } from 'react-icons/hi2'
import { RiGamepadLine, RiTeamLine, RiUserStarLine } from 'react-icons/ri'

export default async function Page() {
  await AccountRedirect('/login')

  return (
    <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,#fff2c7_0%,#fff7df_26%,#fffaf3_58%,#ffffff_100%)] text-stone-900">
      <section className="mx-auto flex min-h-dvh w-full max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative h-full overflow-hidden rounded-4xl border border-orange-200/80 bg-white/80 p-8 shadow-[0_30px_90px_rgba(249,115,22,0.16)] backdrop-blur xl:p-10">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.22),transparent_65%)]" />

            <div className="relative">
              <div className="inline-flex items-center gap-3 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-stone-900">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-[0_16px_30px_rgba(249,115,22,0.32)]">
                  <HiOutlineSparkles className="h-6 w-6" />
                </span>
                <span>
                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-orange-600">
                    Game Hub
                  </span>
                  <span className="block text-lg font-semibold text-stone-900">Player lounge</span>
                </span>
              </div>

              <div className="mt-8 max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-600">
                  Welcome back
                </p>
                <h1 className="mt-4 text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-stone-950 sm:text-6xl">
                  Sign in and jump straight into your player space.
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-8 text-stone-600">
                  Keep your profile ready, share your player ID with friends, and manage your game
                  hub from one clean place.
                </p>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.75rem] border border-orange-100 bg-orange-50/70 p-5">
                  <RiUserStarLine className="h-6 w-6 text-orange-500" />
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
                    Profile
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    Update name, tag, and avatar with the same UI style as the rest of the app.
                  </p>
                </div>
                <div className="rounded-[1.75rem] border border-orange-100 bg-white p-5">
                  <RiTeamLine className="h-6 w-6 text-orange-500" />
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
                    Friends
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    Share your player ID quickly and keep your public identity consistent.
                  </p>
                </div>
                <div className="rounded-[1.75rem] border border-orange-100 bg-orange-50/70 p-5">
                  <RiGamepadLine className="h-6 w-6 text-orange-500" />
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
                    Games
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    Enter the lounge already connected, without extra setup after login.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative h-full overflow-hidden rounded-4xl border border-orange-200 bg-white/88 p-9 shadow-[0_30px_90px_rgba(249,115,22,0.14)] backdrop-blur xl:p-12">
            <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(249,115,22,0.18),transparent)]" />
            <div className="absolute -right-14 top-12 h-40 w-40 rounded-full bg-orange-200/30 blur-3xl" />

            <div className="relative flex h-full flex-col justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-600">
                  Access
                </p>

                <h2 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-stone-950 sm:text-5xl">
                  Continue with Google and get back into the lounge fast.
                </h2>
                <p className="mt-6 max-w-lg text-lg leading-8 text-stone-600">
                  Enter with one click, restore your existing player profile automatically, and
                  continue from the same identity you use across the site.
                </p>

                <div className="mt-10">
                  <GoogleLogBtn />
                </div>
              </div>

              <div className="mt-10 rounded-4xl border border-orange-100 bg-orange-50/75 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-orange-600">
                  Before you enter
                </p>
                <div className="mt-4 space-y-4">
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-orange-600 shadow-sm">
                      1
                    </span>
                    <p className="text-sm leading-7 text-stone-700">
                      Sign in with your Google account.
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-orange-600 shadow-sm">
                      2
                    </span>
                    <p className="text-sm leading-7 text-stone-700">
                      New players choose their name, tag, and profile icon.
                    </p>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-orange-600 shadow-sm">
                      3
                    </span>
                    <p className="text-sm leading-7 text-stone-700">
                      Start playing with your friends and enjoy the lounge!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
