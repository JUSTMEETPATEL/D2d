import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users, Shield, Star } from "lucide-react";

export default function SocialPage() {
  return (
    <>
      <div className="flex items-center justify-between">
         <div>
          <h2 className="text-3xl font-bold tracking-tight">Clan Network</h2>
          <p className="text-muted-foreground">Collaborate and compete with your squad.</p>
        </div>
        <div className="flex gap-2">
            <button className="flex items-center gap-2 bg-secondary/10 text-secondary px-4 py-2 rounded-lg font-medium border border-secondary/20 hover:bg-secondary/20 transition-colors">
                <Shield className="h-4 w-4" />
                Find Clan
            </button>
             <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors">
                <Users className="h-4 w-4" />
                Invite Friends
            </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Leaderboard */}
        <Card className="md:col-span-2 bg-card/60 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-chart-5" />
                    Global Leaderboard
                </CardTitle>
                <CardDescription>Top performers this week</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {[
                        { rank: 1, name: "CyberNinja", xp: "15,400", level: 42, active: true },
                        { rank: 2, name: "PixelArtist", xp: "14,200", level: 38, active: false },
                        { rank: 3, name: "CodeMaster", xp: "13,850", level: 35, active: false },
                        { rank: 4, name: "You", xp: "12,100", level: 28, active: true, me: true },
                        { rank: 5, name: "FitnessGuru", xp: "11,500", level: 30, active: false },
                    ].map((user, i) => (
                        <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${user.me ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50'}`}>
                            <div className="flex items-center gap-4">
                                <span className={`font-bold w-6 text-center ${user.rank <= 3 ? 'text-chart-5' : 'text-muted-foreground'}`}>#{user.rank}</span>
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center relative">
                                        {user.rank === 1 && <Trophy className="h-4 w-4 text-chart-5 absolute -top-1 -right-1" />}
                                        <span className="font-semibold text-xs">{user.name.substring(0, 2).toUpperCase()}</span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm leading-none">{user.name}</p>
                                        <p className="text-xs text-muted-foreground mt-1">Level {user.level}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="font-bold block">{user.xp} XP</span>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>

        {/* Clan Status */}
        <div className="space-y-6">
            <Card className="bg-gradient-to-b from-primary/10 to-transparent border-primary/20">
                <CardHeader>
                    <CardTitle className="text-lg">Clan Alpha</CardTitle>
                    <CardDescription>Level 5 • 12 Members</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Weekly Goal</span>
                            <span className="font-medium">85%</span>
                        </div>
                        <div className="h-2 w-full bg-primary/10 rounded-full overflow-hidden">
                            <div className="h-full w-[85%] bg-primary" />
                        </div>
                        <div className="text-xs text-center text-muted-foreground">
                            150 tasks needed to reach Level 6
                        </div>
                    </div>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Star className="h-4 w-4 text-chart-4" />
                        Active Quests
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                        <p className="text-sm font-medium">Study Marathon</p>
                        <p className="text-xs text-muted-foreground mt-1">Complete 50h of study as a clan</p>
                    </div>
                     <div className="p-3 bg-muted/30 rounded-lg border border-border/50 opacity-60">
                        <p className="text-sm font-medium">Morning Glory</p>
                        <p className="text-xs text-muted-foreground mt-1">All members wake up by 7AM</p>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
    </>
  );
}
