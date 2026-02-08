"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, CheckSquare, Users, Apple, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Social", href: "/social", icon: Users },
  { name: "Nutrition", href: "/nutrition", icon: Apple },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="p-6">
        <h1 className="text-2xl font-bold tracking-tighter text-primary drop-shadow-[0_0_10px_rgba(var(--primary),0.5)]">
          D2D <span className="text-foreground text-sm font-normal opacity-70">OS</span>
        </h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className="block group relative">
              {isActive && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute inset-0 bg-sidebar-accent rounded-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              )}
              <div className={cn(
                "relative flex items-center gap-3 px-4 py-3 rounded-lg transition-colors z-10",
                isActive ? "text-sidebar-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
              )}>
                <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <span>{item.name}</span>
                {isActive && (
                   <motion.div
                    layoutId="activeGlow"
                    className="absolute left-0 w-1 h-6 bg-primary rounded-r-full shadow-[0_0_10px_var(--primary)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2">
        <button className="flex w-full items-center gap-3 px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 rounded-lg transition-colors">
            <Settings className="h-5 w-5" />
            <span>Settings</span>
        </button>
         <button className="flex w-full items-center gap-3 px-4 py-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
            <LogOut className="h-5 w-5" />
            <span>Log Out</span>
        </button>
      </div>
    </div>
  );
}
