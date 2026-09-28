import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { usePresignedUpload } from "@/hooks/use-presigned-upload";
import { client, unwrap } from "@/lib/api";
import { useSession } from "@/lib/session";

export function HomePage() {
	const { data: session } = useSession();
	const helloQuery = useQuery({
		queryKey: ["hello"],
		queryFn: () => unwrap(client.api.hello.$get()),
	});
	const errorMutation = useMutation({
		mutationFn: () =>
			unwrap(client.api.users[":id"].$get({ param: { id: "999999" } })),
	});

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
						/api/hello:{" "}
						{helloQuery.isPending
							? "Loading..."
							: (helloQuery.data?.message ??
								helloQuery.error?.message ??
								"Failed to load")}
						{errorMutation.isError && (
							<span className="text-red-500">
								{" "}
								| error: {errorMutation.error.message}
							</span>
						)}
					</p>
					<div className="flex gap-2">
						<Button onClick={() => helloQuery.refetch()}>Refetch</Button>
						<Button
							variant="outline"
							disabled={errorMutation.isPending}
							onClick={() => errorMutation.mutate()}
						>
							Trigger API error
						</Button>
					</div>
				</CardContent>
			</Card>

			<StorageDemo />
		</div>
	);
}

function StorageDemo() {
	const { upload, uploading, uploaded, error } = usePresignedUpload("avatars");
	const [previewUrl, setPreviewUrl] = useState("");

	const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		try {
			const result = await upload(file);
			const download = await unwrap(
				await client.api.storage.download.$get({
					query: { key: result.key },
				}),
			);
			setPreviewUrl(download.url);
		} catch {
			// the hook already surfaces the error message
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Object storage demo</CardTitle>
				<CardDescription>
					Presigned upload to S3-compatible storage (R2) — file bytes bypass the
					Worker entirely.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 text-sm">
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					className="text-sm"
					disabled={uploading}
					onChange={onFileChange}
				/>
				{uploading && <p className="text-muted-foreground">Uploading…</p>}
				{uploaded && (
					<p className="font-mono text-xs break-all text-muted-foreground">
						{uploaded.key}
					</p>
				)}
				{previewUrl && (
					<img
						src={previewUrl}
						alt="Uploaded preview"
						className="max-h-48 rounded-md border"
					/>
				)}
				{error && <p className="text-red-500">{error}</p>}
			</CardContent>
		</Card>
	);
}
