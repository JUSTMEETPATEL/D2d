import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden md:flex">
        <AppSidebar />
      </aside>
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
          {children}
        </div>
        
        {/* Background Ambient Glow */}
        <div className="pointer-events-none fixed top-0 right-0 h-[500px] w-[500px] bg-primary/20 blur-[100px] opacity-20 -z-10 rounded-full mix-blend-screen" />
        <div className="pointer-events-none fixed bottom-0 left-0 h-[500px] w-[500px] bg-secondary/20 blur-[100px] opacity-20 -z-10 rounded-full mix-blend-screen" />
      </main>
    </div>
  );
}
