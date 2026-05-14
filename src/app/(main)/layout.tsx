import { Sidebar } from '@/shared/components/layout/sidebar'
import { BottomNav } from '@/shared/components/layout/bottom-nav'
import { AssistantWidget } from '@/features/assistant/components'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pt-14 pb-20 md:pt-0 md:pb-0 md:ml-72">
        {children}
      </main>
      <BottomNav />
      <AssistantWidget />
    </div>
  )
}
