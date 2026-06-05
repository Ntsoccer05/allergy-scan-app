import { Navbar } from '@/components/organisms/Navbar'

type Props = { children: React.ReactNode }

export const AppLayout = ({ children }: Props) => (
  <div className="flex min-h-screen">
    <Navbar />
    {/* Shift content right on desktop to account for fixed sidebar (w-56) */}
    <main className="flex-1 pb-16 lg:pb-0 lg:pl-56">
      {children}
    </main>
  </div>
)
