import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, CheckCircle2, Zap, Shield, BrainCircuit, Check, HelpCircle, Layers, Repeat } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Navbar */}
      <header className="px-6 h-16 flex items-center justify-between border-b border-white/5 bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="font-bold text-xl tracking-tighter flex items-center gap-2">
            <span className="bg-primary h-6 w-6 rounded-lg flex items-center justify-center text-primary-foreground text-xs">D</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">D2D OS</span>
        </div>
        <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors">Login</Link>
             <Link href="/dashboard">
                <Button size="sm" className="font-semibold shadow-[0_0_15px_rgba(var(--primary),0.3)] hover:shadow-[0_0_25px_rgba(var(--primary),0.5)] transition-shadow">
                    Enter Command <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-24 px-6 flex flex-col items-center text-center overflow-hidden">
             {/* Background Glows */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/20 blur-[120px] rounded-full -z-10 animate-pulse-slow" />
            
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium mb-6 animate-in fade-in slide-in-from-bottom-5 duration-500 hover:border-primary/50 transition-colors cursor-default">
                <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                System Operational v1.0
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 animate-in fade-in slide-in-from-bottom-5 duration-700 delay-150">
                Stop Procrastinating. <br />
                <span className="text-primary drop-shadow-[0_0_20px_rgba(var(--primary),0.5)]">Start Executing.</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mb-10 animate-in fade-in slide-in-from-bottom-5 duration-700 delay-300">
                The behavior-driven execution platform involved in your success. D2D learns how you work and adapts your schedule to ensure you actually finish what you start.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-bottom-5 duration-700 delay-500">
                <Link href="/dashboard">
                    <Button size="lg" className="h-12 px-8 text-lg shadow-[0_0_30px_rgba(var(--primary),0.3)] hover:shadow-[0_0_40px_rgba(var(--primary),0.5)] transition-shadow">
                        Get Started
                    </Button>
                </Link>
                <Button variant="outline" size="lg" className="h-12 px-8 text-lg bg-transparent border-white/10 hover:bg-white/5 hover:border-white/20">
                    View Manifesto
                </Button>
            </div>
            
            {/* UI Mockup / Visual */}
            <div className="mt-20 relative w-full max-w-5xl aspect-video rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-1000 delay-700 group">
                 <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
                 
                 {/* Abstract UI Representation */}
                 <div className="p-8 grid grid-cols-3 gap-6 opacity-60 group-hover:opacity-80 transition-opacity duration-700">
                    <div className="space-y-4">
                        <div className="h-8 w-1/2 bg-white/10 rounded animate-pulse" style={{ animationDelay: "0ms" }} />
                        <div className="h-32 bg-white/5 rounded-lg border border-white/5 hover:border-primary/30 transition-colors" />
                        <div className="h-32 bg-white/5 rounded-lg border border-white/5 hover:border-primary/30 transition-colors" />
                    </div>
                    <div className="col-span-2 space-y-4 pt-12">
                         <div className="h-8 w-1/3 bg-white/10 rounded animate-pulse" style={{ animationDelay: "150ms" }} />
                         <div className="h-64 bg-primary/5 rounded-lg border border-primary/20 flex items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
                            <div className="text-center p-6">
                                <div className="h-20 w-20 bg-primary/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                                    <BrainCircuit className="h-10 w-10 text-primary" />
                                </div>
                                <h4 className="text-xl font-bold">Decision Engine Active</h4>
                                <p className="text-sm text-muted-foreground mt-2">Optimizing schedule based on energy levels...</p>
                            </div>
                         </div>
                    </div>
                 </div>
            </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 px-6 bg-white/5 border-y border-white/5 relative">
            <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
                {[
                    { title: "Smart Scheduling", desc: "Missed a task? D2D automatically reschedules it to your high-success slots.", icon: BrainCircuit },
                    { title: "Gamified Discipline", desc: "Earn XP, maintain streaks, and compete with clans to stay motivated.", icon: Zap },
                    { title: "Anti-Burnout", desc: "Energy tracking ensures you don't overwork. Recovery mode enabled when needed.", icon: Shield },
                ].map((feature, i) => (
                    <div key={i} className="p-8 rounded-2xl bg-black/40 border border-white/5 hover:border-primary/50 hover:bg-black/60 transition-all duration-300 group hover:-translate-y-1">
                        <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 text-primary group-hover:scale-110 group-hover:bg-primary/20 transition-all">
                            <feature.icon className="h-7 w-7" />
                        </div>
                        <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                        <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                    </div>
                ))}
            </div>
        </section>

        {/* How It Works */}
        <section className="py-24 px-6 bg-background relative overflow-hidden">
             <div className="max-w-4xl mx-auto text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-bold mb-6">Execution Protocol</h2>
                <p className="text-lg text-muted-foreground">Most to-do apps are passive lists where dreams go to die. <br/> D2D is an active system that forces execution.</p>
            </div>

            <div className="max-w-5xl mx-auto space-y-12 md:space-y-0 md:grid md:grid-cols-3 md:gap-12 relative">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent -z-10" />

                {[
                   { step: "01", title: "Input", desc: "Dump your tasks, goals, and deadlines into the system. Voice or text.", icon: Layers },
                   { step: "02", title: "Process", desc: "Our non-LLM Decision Engine scores your history to find the perfect slot.", icon: BrainCircuit },
                   { step: "03", title: "Persist", desc: "If you miss it, we reschedule it. We nag you. We don't let you quit.", icon: Repeat },
                ].map((item, i) => (
                    <div key={i} className="flex flex-col items-center text-center">
                        <div className="h-24 w-24 rounded-full bg-background border-4 border-muted flex items-center justify-center mb-6 z-10 shadow-xl group hover:border-primary transition-colors duration-300">
                             <item.icon className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <h3 className="text-2xl font-bold mb-3">{item.title}</h3>
                        <p className="text-muted-foreground">{item.desc}</p>
                    </div>
                ))}
            </div>
        </section>

        {/* Pricing */}
        <section className="py-24 px-6 bg-white/5 border-y border-white/5">
             <div className="max-w-4xl mx-auto text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-6">Choose Your Rank</h2>
                <p className="text-muted-foreground">Core discipline is free. Advanced tools for the elite.</p>
            </div>

            <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-center">
                {/* Free Tier */}
                <Card className="bg-transparent border-white/10 hover:border-white/20 transition-colors">
                    <CardHeader>
                        <CardTitle className="text-2xl">Cadet</CardTitle>
                        <CardDescription>Essential tools to build consistency.</CardDescription>
                        <div className="mt-4 text-4xl font-bold">$0 <span className="text-sm font-normal text-muted-foreground">/ forever</span></div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ul className="space-y-3">
                            {["Unlimited Tasks", "Basic Decision Engine", "Core Gamification (XP)", "2 Clans Max", "Basic Nutrition"].map((item, i) => (
                                <li key={i} className="flex items-center gap-3">
                                    <Check className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full">Start Free</Button>
                    </CardFooter>
                </Card>

                {/* Premium Tier */}
                 <Card className="bg-primary/5 border-primary/50 shadow-[0_0_30px_rgba(var(--primary),0.1)] relative overflow-hidden transform md:scale-105">
                     <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">RECOMMENDED</div>
                    <CardHeader>
                        <CardTitle className="text-2xl text-primary">Commander</CardTitle>
                        <CardDescription>Full arsenal for peak performance.</CardDescription>
                         <div className="mt-4 text-4xl font-bold">$6.99 <span className="text-sm font-normal text-muted-foreground">/ month</span></div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ul className="space-y-3">
                             {["Everything in Cadet", "Unlimited Clans", "Advanced Analytics", "Priority Support", "AI Coach (Beta Access)", "Dark Mode Themes"].map((item, i) => (
                                <li key={i} className="flex items-center gap-3">
                                    <CheckCircle2 className="h-4 w-4 text-primary" />
                                    <span className="font-medium">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                    <CardFooter>
                         <Button className="w-full shadow-lg shadow-primary/20">Upgrade to Commander</Button>
                    </CardFooter>
                </Card>
            </div>
        </section>

        {/* FAQ */}
        <section className="py-24 px-6 max-w-3xl mx-auto">
             <div className="text-center mb-16">
                <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
            </div>
            
            <Accordion type="single" collapsible className="w-full">
                {[
                    { q: "How is this different from other to-do apps?", a: "Most apps are passive lists. D2D is an active system that reschedules uncompleted tasks based on your energy and history, ensuring you actually finish them." },
                    { q: "Is the app really free?", a: "Yes. The core features you need to build discipline—tasks, gamification, and basic nutrition—are completely free forever." },
                    { q: "What is the 'Decision Engine'?", a: "It's a non-LLM algorithm that analyzes your past performance to suggest the best time slots for your tasks, maximizing your completion rate." },
                    { q: "Can I use it for my team?", a: "Yes! Clans allow you to group up, share quests, and compete on leaderboards. Perfect for study groups or small teams." },
                ].map((item, i) => (
                    <AccordionItem key={i} value={`item-${i}`}>
                        <AccordionTrigger className="text-left text-lg hover:text-primary transition-colors">{item.q}</AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">
                            {item.a}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 bg-black/20 text-center md:text-left">
        <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
                <div className="font-bold text-2xl tracking-tighter flex items-center gap-2 mb-4">
                    <span className="bg-primary h-6 w-6 rounded-lg flex items-center justify-center text-primary-foreground text-xs">D</span>
                    D2D OS
                </div>
                <p className="text-muted-foreground text-sm max-w-xs">
                    The only productivity system designed to force execution through behavior-driven logistics.
                </p>
            </div>
            
            <div>
                <h4 className="font-bold mb-4">Product</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                    <li><Link href="#" className="hover:text-primary transition-colors">Manifesto</Link></li>
                    <li><Link href="#" className="hover:text-primary transition-colors">Pricing</Link></li>
                    <li><Link href="#" className="hover:text-primary transition-colors">Roadmap</Link></li>
                </ul>
            </div>
             <div>
                <h4 className="font-bold mb-4">Legal</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                    <li><Link href="#" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
                    <li><Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                    <li><Link href="#" className="hover:text-primary transition-colors">Contact</Link></li>
                </ul>
            </div>
        </div>
        <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-white/5 text-center text-xs text-muted-foreground">
            <p>© 2026 D2D Systems. All rights reserved. Execute or perish.</p>
        </div>
      </footer>
    </div>
  );
}
