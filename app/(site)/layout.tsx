import AccountRedirect from '@/lib/accountRedirect'
import NavBar from '@/components/NavBar'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await AccountRedirect('/')
  return (
    <>
      <NavBar />
      <div className="min-h-[calc(100dvh-5.5rem-1px)] bg-[linear-gradient(180deg,#fffaf5_0%,#ffffff_22%,#fff6eb_100%)] text-stone-900">
        <div className="mx-auto min-h-[calc(100dvh-5.5rem-1px)] w-full max-w-7xl box-border px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
    </>
  )
}
