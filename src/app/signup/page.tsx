"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async () => {
    setLoading(true);
    await authClient.signUp.email({
        email,
        password,
        name,
    }, {
        onSuccess: () => {
             router.push("/dashboard");
        },
        onError: (ctx) => {
             alert(ctx.error.message);
             setLoading(false);
        }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute inset-0 bg-secondary/5 pointer-events-none" />
      <Card className="w-full max-w-md border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl relative z-10">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight text-center">New Recruit</CardTitle>
          <CardDescription className="text-center">
            Initialize your D2D profile to start executing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="space-y-2">
            <Label htmlFor="name">Agent Name</Label>
            <Input 
                id="name" 
                type="text" 
                placeholder="CyberNinja" 
                className="bg-secondary/10 border-white/10 focus-visible:ring-primary"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
                id="email" 
                type="email" 
                placeholder="agent@d2d.com" 
                className="bg-secondary/10 border-white/10 focus-visible:ring-primary"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input 
                id="password" 
                type="password" 
                className="bg-secondary/10 border-white/10 focus-visible:ring-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <Button 
            className="w-full shadow-[0_0_20px_rgba(var(--primary),0.2)] hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] transition-shadow" 
            onClick={handleSignup}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            {loading ? "Initializing..." : "Create Account"}
          </Button>
        </CardContent>
        <CardFooter className="justify-center">
           <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="text-primary hover:underline font-medium">
                    Log in
                </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
