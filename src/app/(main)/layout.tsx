import { Sidebar } from '@/shared/components/layout/sidebar'
import { BottomNav } from '@/shared/components/layout/bottom-nav'
import { AssistantSidePanel, MainShell } from '@/features/assistant/components'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MainShell>{children}</MainShell>
      <BottomNav />
      <AssistantSidePanel />
    </div>
  )
}
