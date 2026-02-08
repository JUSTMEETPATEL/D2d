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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setLoading(true);
    await authClient.signIn.email({
        email,
        password,
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
      <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
      <Card className="w-full max-w-md border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl relative z-10">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight text-center">System Access</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access D2D Command.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="#" className="text-xs text-muted-foreground hover:text-primary">Forgot password?</Link>
            </div>
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
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            {loading ? "Authenticating..." : "Login"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
          
           <div className="grid grid-cols-2 gap-4">
               <Button variant="outline" className="border-white/10 hover:bg-white/5" disabled>Github</Button>
               <Button variant="outline" className="border-white/10 hover:bg-white/5" disabled>Google</Button>
           </div>

        </CardContent>
        <CardFooter className="justify-center">
           <p className="text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="text-primary hover:underline font-medium">
                    Sign up
                </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
