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
import { Link, Navigate, useNavigate } from "react-router";
import { authClient } from "@/lib/auth-client";

export function RegisterPage() {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();

	if (session) {
		return <Navigate to="/" replace />;
	}

	const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = new FormData(e.currentTarget);
		const { error } = await authClient.signUp.email({
			name: String(form.get("name") ?? ""),
			email: String(form.get("email") ?? ""),
			password: String(form.get("password") ?? ""),
		});
		if (error) {
			alert(error.message ?? "Registration failed");
			return;
		}
		navigate("/", { replace: true });
	};

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Create account</CardTitle>
					<CardDescription>
						The first registered user becomes the admin.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-4" onSubmit={onSubmit}>
						<div className="flex flex-col gap-2">
							<Label htmlFor="name">Name</Label>
							<Input id="name" name="name" placeholder="Your name" required />
						</div>
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
								placeholder="At least 8 characters"
								minLength={8}
								required
							/>
						</div>
						<Button type="submit">Register</Button>
					</form>
					<p className="text-muted-foreground mt-4 text-center text-sm">
						Already have an account?{" "}
						<Link to="/login" className="text-primary underline">
							Sign in
						</Link>
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
