import { Sidebar } from './sidebar'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64">
        {children}
      </main>
    </div>
  )
}
