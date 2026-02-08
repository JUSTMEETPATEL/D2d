import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Flame, Target, Zap, Clock } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Command Center</h2>
          <p className="text-muted-foreground">Welcome back, Agent. Systems are operational.</p>
        </div>
        <div className="flex items-center gap-2">
           <div className="flex items-center gap-1 bg-chart-5/10 text-chart-5 px-3 py-1 rounded-full border border-chart-5/20">
              <Flame className="h-4 w-4 fill-chart-5" />
              <span className="font-bold">12 Day Streak</span>
           </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-card to-card/50 border-primary/20 shadow-lg shadow-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total XP</CardTitle>
            <Zap className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2,350</div>
            <p className="text-xs text-muted-foreground">
              +180 from yesterday
            </p>
            <Progress value={45} className="h-2 mt-3 bg-primary/20" />
            <p className="text-[10px] text-right mt-1 text-muted-foreground">Level 5 (45%)</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-card to-card/50 border-secondary/20 shadow-lg shadow-secondary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks Completed</CardTitle>
            <Target className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12/15</div>
            <p className="text-xs text-muted-foreground">
              80% completion rate
            </p>
            <Progress value={80} className="h-2 mt-3 bg-secondary/20" />
          </CardContent>
        </Card>
        
         <Card className="bg-gradient-to-br from-card to-card/50 border-chart-3/20 shadow-lg shadow-chart-3/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Focus Time</CardTitle>
            <Clock className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4h 12m</div>
            <p className="text-xs text-muted-foreground">
              +12% from average
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-card/50 border-chart-4/20 shadow-lg shadow-chart-4/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calories</CardTitle>
            <Flame className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,850</div>
             <p className="text-xs text-muted-foreground">
              Daily Target: 2,200
            </p>
             <Progress value={84} className="h-2 mt-3 bg-chart-4/20" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-sidebar-border bg-sidebar/50">
          <CardHeader>
            <CardTitle>Current Objective</CardTitle>
            <CardDescription>
              Your prioritized tasks for the next block.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
                {[
                    { title: "Complete System Architecture", time: "10:00 AM", priority: "High", color: "bg-destructive/10 text-destructive border-destructive/20" },
                    { title: "Review PRD Updates", time: "11:30 AM", priority: "Medium", color: "bg-chart-5/10 text-chart-5 border-chart-5/20" },
                    { title: "Team Sync", time: "2:00 PM", priority: "Normal", color: "bg-primary/10 text-primary border-primary/20" }
                ].map((task, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card/40 hover:bg-card/60 transition-colors group cursor-pointer">
                        <div className="flex items-center gap-4">
                            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 group-hover:border-primary transition-colors" />
                            <div>
                                <h4 className="font-semibold group-hover:text-primary transition-colors">{task.title}</h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                    <Clock className="h-3 w-3" />
                                    <span>{task.time}</span>
                                </div>
                            </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-md border font-medium ${task.color}`}>
                            {task.priority}
                        </span>
                    </div>
                ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3 border-sidebar-border bg-sidebar/50">
          <CardHeader>
            <CardTitle>Live Feed</CardTitle>
            <CardDescription>
              Clan activity and system alerts.
            </CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
                {[
                    { user: "Alex M.", action: "completed a workout", time: "2m ago" },
                    { user: "Sarah K.", action: "reached Level 6", time: "15m ago" },
                    { user: "Clan Alpha", action: "won the weekly challenge", time: "1h ago" },
                ].map((item, i) => (
                    <div key={i} className="flex items-start gap-4 text-sm pb-4 border-b border-border/50 last:border-0">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold text-white">
                            {item.user.charAt(0)}
                        </div>
                        <div>
                            <p className="leading-none"><span className="font-semibold text-foreground">{item.user}</span> <span className="text-muted-foreground">{item.action}</span></p>
                            <p className="text-xs text-muted-foreground mt-1">{item.time}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border/50">
               <Link href="/social" className="text-xs text-primary hover:underline flex items-center gap-1">View all activity <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
