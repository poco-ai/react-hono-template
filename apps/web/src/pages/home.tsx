import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { useCallback, useEffect, useState } from "react";
import { client, unwrap } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export function HomePage() {
	const { data: session } = authClient.useSession();
	const [hello, setHello] = useState("Loading...");
	const [error, setError] = useState("");

	const loadHello = useCallback(async () => {
		try {
			const body = await unwrap(await client.api.hello.$get());
			setHello(body.message);
			setError("");
		} catch (e) {
			setHello("");
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		loadHello();
	}, [loadHello]);

	const fetchMissingUser = useCallback(async () => {
		try {
			await unwrap(
				await client.api.users[":id"].$get({ param: { id: "999999" } }),
			);
			setError("");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Signed in
						{session?.user.role === "admin" && (
							<Badge variant="secondary">admin</Badge>
						)}
					</CardTitle>
					<CardDescription>
						Your session, issued by better-auth.
					</CardDescription>
				</CardHeader>
				<CardContent className="text-sm">
					<dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<div className="flex gap-2">
							<dt className="text-muted-foreground">Name:</dt>
							<dd>{session?.user.name}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="text-muted-foreground">Email:</dt>
							<dd>{session?.user.email}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="text-muted-foreground">Role:</dt>
							<dd>{session?.user.role}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="text-muted-foreground">User ID:</dt>
							<dd className="font-mono text-xs">{session?.user.id}</dd>
						</div>
					</dl>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>RPC demo</CardTitle>
					<CardDescription>
						End-to-end typed calls via the Vite /api proxy.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 text-sm">
					<p className="text-muted-foreground">
						/api/hello: {hello}
						{error && <span className="text-red-500"> | error: {error}</span>}
					</p>
					<div className="flex gap-2">
						<Button onClick={loadHello}>Refetch</Button>
						<Button variant="outline" onClick={fetchMissingUser}>
							Trigger API error
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
