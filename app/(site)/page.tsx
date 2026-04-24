import AccountRedirect from '@/lib/accountRedirect'

export default async function Home() {
  await AccountRedirect('/')
  return <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]"></section>
}
