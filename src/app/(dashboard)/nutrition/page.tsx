import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Plus, Flame, Activity, Droplets } from "lucide-react";

export default function NutritionPage() {
  return (
    <>
      <div className="flex items-center justify-between">
         <div>
          <h2 className="text-3xl font-bold tracking-tight">Fuel Log</h2>
          <p className="text-muted-foreground">Monitor nutritional intake and hydration levels.</p>
        </div>
        <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" />
            Log Meal
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {/* Main Stats */}
        <Card className="md:col-span-3">
             <CardHeader>
                 <CardTitle>Daily Summary</CardTitle>
             </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                     <div className="text-center space-y-2">
                        <div className="relative h-32 w-32 mx-auto flex items-center justify-center rounded-full border-4 border-muted">
                            <svg className="absolute inset-0 h-full w-full -rotate-90 text-primary" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="290" strokeDashoffset="50" className="text-chart-4" />
                            </svg>
                            <div className="text-center">
                                <Flame className="h-6 w-6 mx-auto text-chart-4 mb-1" />
                                <span className="text-2xl font-bold">1,850</span>
                                <span className="block text-xs text-muted-foreground">Kcal</span>
                            </div>
                        </div>
                        <p className="text-sm font-medium">Calories Left: 350</p>
                    </div>
                    
                    <div className="space-y-4 pt-4">
                        <div>
                             <div className="flex justify-between text-xs mb-1">
                                <span>Protein</span>
                                <span>110 / 150g</span>
                            </div>
                            <Progress value={73} className="h-2 bg-muted text-chart-1" />
                        </div>
                         <div>
                             <div className="flex justify-between text-xs mb-1">
                                <span>Carbs</span>
                                <span>200 / 250g</span>
                            </div>
                            <Progress value={80} className="h-2 bg-muted text-chart-2" />
                        </div>
                         <div>
                             <div className="flex justify-between text-xs mb-1">
                                <span>Fats</span>
                                <span>45 / 60g</span>
                            </div>
                            <Progress value={75} className="h-2 bg-muted text-chart-3" />
                        </div>
                    </div>

                     <div className="col-span-2 bg-muted/30 rounded-xl p-4 flex items-center justify-between border border-border/50">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <Droplets className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <h4 className="font-semibold">Hydration</h4>
                                <p className="text-xs text-muted-foreground">1.5L / 2.5L Target</p>
                            </div>
                        </div>
                         <button className="text-xs bg-blue-500/10 text-blue-500 px-3 py-1.5 rounded-md hover:bg-blue-500/20 transition-colors">
                            + 250ml
                         </button>
                    </div>
                </div>
            </CardContent>
        </Card>

        {/* Meal Log */}
        <div className="space-y-4">
            <h3 className="font-semibold px-1">Recent Logs</h3>
             {[
                 { name: "Oatmeal Bowl", time: "8:30 AM", cal: 450 },
                 { name: "Grilled Chicken", time: "1:15 PM", cal: 620 },
                 { name: "Protein Shake", time: "4:00 PM", cal: 180 },
             ].map((meal, i) => (
                 <Card key={i} className="bg-card/50 hover:bg-card transition-colors">
                     <CardContent className="p-4 flex justify-between items-center">
                         <div>
                             <p className="font-medium text-sm">{meal.name}</p>
                             <p className="text-xs text-muted-foreground">{meal.time}</p>
                         </div>
                         <span className="text-sm font-bold text-muted-foreground">{meal.cal}</span>
                     </CardContent>
                 </Card>
             ))}
        </div>
      </div>
    </>
  );
}
