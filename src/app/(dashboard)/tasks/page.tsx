import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MoveRight, Plus } from "lucide-react";

export default function TasksPage() {
  return (
    <>
      <div className="flex items-center justify-between">
         <div>
          <h2 className="text-3xl font-bold tracking-tight">Mission Log</h2>
          <p className="text-muted-foreground">Manage your objectives and tactical operations.</p>
        </div>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" />
            New Task
        </button>
      </div>

      {/* Kanban Board Placeholder */}
      <div className="grid md:grid-cols-3 gap-6 h-full min-h-[500px]">
        {/* To Do Column */}
        <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="font-semibold text-muted-foreground">Pending Queues</h3>
                <span className="bg-card text-xs border border-border px-2 py-0.5 rounded-full">3</span>
            </div>
            <div className="space-y-3">
                 <Card className="bg-card hover:border-primary/50 transition-colors cursor-grab active:cursor-grabbing">
                    <CardHeader className="p-4">
                        <CardTitle className="text-base font-medium">Research Flutter vs React Native</CardTitle>
                        <CardDescription className="text-xs mt-1">Due Today, 5:00 PM</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="flex gap-2 mt-2">
                            <span className="text-[10px] px-2 py-1 rounded bg-secondary/10 text-secondary border border-secondary/20">Dev</span>
                            <span className="text-[10px] px-2 py-1 rounded bg-chart-1/10 text-chart-1 border border-chart-1/20">High Priority</span>
                        </div>
                    </CardContent>
                </Card>
                 <Card className="bg-card hover:border-primary/50 transition-colors cursor-grab active:cursor-grabbing">
                    <CardHeader className="p-4">
                        <CardTitle className="text-base font-medium">Draft User Interview Questions</CardTitle>
                        <CardDescription className="text-xs mt-1">Tomorrow, 10:00 AM</CardDescription>
                    </CardHeader>
                     <CardContent className="p-4 pt-0">
                        <div className="flex gap-2 mt-2">
                            <span className="text-[10px] px-2 py-1 rounded bg-chart-3/10 text-chart-3 border border-chart-3/20">Product</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>

        {/* In Progress Column */}
         <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="font-semibold text-primary">Active Operations</h3>
                <span className="bg-primary/10 text-primary text-xs border border-primary/20 px-2 py-0.5 rounded-full">1</span>
            </div>
            <div className="space-y-3">
                 <Card className="bg-card border-primary/40 shadow-md shadow-primary/5 cursor-grab active:cursor-grabbing">
                    <CardHeader className="p-4">
                        <CardTitle className="text-base font-medium">Implement Auth Flow</CardTitle>
                        <CardDescription className="text-xs mt-1">Started 2h ago</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                         <div className="h-1 w-full bg-secondary/10 rounded-full overflow-hidden mt-2">
                            <div className="h-full bg-primary w-1/3" />
                         </div>
                         <div className="flex justify-between items-center mt-2">
                            <span className="text-[10px] text-muted-foreground">33% Complete</span>
                            <MoveRight className="h-3 w-3 text-muted-foreground" />
                         </div>
                    </CardContent>
                </Card>
            </div>
        </div>

        {/* Done Column */}
         <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="font-semibold text-muted-foreground">Completed Logs</h3>
                <span className="bg-card text-xs border border-border px-2 py-0.5 rounded-full">5</span>
            </div>
             <div className="space-y-3 opacity-60 hover:opacity-100 transition-opacity">
                 <Card className="bg-muted/50 border-transparent">
                    <CardHeader className="p-4">
                        <CardTitle className="text-base font-medium line-through text-muted-foreground">Setup Project Repo</CardTitle>
                    </CardHeader>
                </Card>
            </div>
        </div>
      </div>
    </>
  );
}
