import { useQueryClient } from "@tanstack/react-query";
import {
	Link,
	useNavigate,
	useRouter,
	useSearch,
} from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import type { FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { sessionOptions } from "@/lib/session";

export function LoginPage() {
	const navigate = useNavigate({ from: "/login" });
	const router = useRouter();
	const queryClient = useQueryClient();
	const { redirect: redirectTo } = useSearch({ from: "/login" });

	const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = new FormData(e.currentTarget);
		const { error } = await authClient.signIn.email({
			email: String(form.get("email") ?? ""),
			password: String(form.get("password") ?? ""),
		});
		if (error) {
			alert(error.message ?? "Login failed");
			return;
		}
		queryClient.removeQueries({ queryKey: sessionOptions.queryKey });
		if (redirectTo) {
			router.history.push(redirectTo);
		} else {
			navigate({ to: "/", replace: true });
		}
	};

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Sign in</CardTitle>
					<CardDescription>
						Enter your email and password to continue.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-4" onSubmit={onSubmit}>
						<div className="flex flex-col gap-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="you@example.com"
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								name="password"
								type="password"
								placeholder="••••••••"
								required
							/>
						</div>
						<Button type="submit">Sign in</Button>
					</form>
					<p className="text-muted-foreground mt-4 text-center text-sm">
						No account?{" "}
						<Link to="/register" className="text-primary underline">
							Register
						</Link>
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
