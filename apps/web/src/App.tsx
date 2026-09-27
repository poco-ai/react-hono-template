import { Button } from "@workspace/ui/components/button";
import { useCallback, useEffect, useState } from "react";
import { client, unwrap } from "@/lib/api";

export function App() {
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
		<div className="flex min-h-svh p-6">
			<div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
				<div>
					<h1 className="font-medium">Project ready!</h1>
					<p>You may now add components and start building.</p>
					<p className="text-muted-foreground">
						RPC demo: {hello}
						{error && <span className="text-red-500"> | error: {error}</span>}
					</p>
					<div className="mt-2 flex gap-2">
						<Button onClick={loadHello}>Refetch</Button>
						<Button variant="outline" onClick={fetchMissingUser}>
							Trigger API error
						</Button>
					</div>
				</div>
				<div className="text-muted-foreground font-mono text-xs">
					(Press <kbd>d</kbd> to toggle dark mode)
				</div>
			</div>
		</div>
	);
}
