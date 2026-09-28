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
import { useTranslation } from "react-i18next";
import { usePresignedUpload } from "@/hooks/use-presigned-upload";
import { client, unwrap } from "@/lib/api";
import { useSession } from "@/lib/session";

export function HomePage() {
	const { t } = useTranslation();
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
						{t("home.signedIn")}
						{session?.user.role === "admin" && (
							<Badge variant="secondary">admin</Badge>
						)}
					</CardTitle>
					<CardDescription>{t("home.sessionDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="text-sm">
					<dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<div className="flex gap-2">
							<dt className="text-muted-foreground">{t("common.name")}:</dt>
							<dd>{session?.user.name}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="text-muted-foreground">{t("common.email")}:</dt>
							<dd>{session?.user.email}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="text-muted-foreground">{t("common.role")}:</dt>
							<dd>{session?.user.role}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="text-muted-foreground">{t("home.userId")}:</dt>
							<dd className="font-mono text-xs">{session?.user.id}</dd>
						</div>
					</dl>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("home.rpcTitle")}</CardTitle>
					<CardDescription>{t("home.rpcDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 text-sm">
					<p className="text-muted-foreground">
						/api/hello:{" "}
						{helloQuery.isPending
							? t("common.loading")
							: (helloQuery.data?.message ??
								helloQuery.error?.message ??
								t("common.failedToLoad"))}
						{errorMutation.isError && (
							<span className="text-red-500">
								{" "}
								| {t("common.error")}: {errorMutation.error.message}
							</span>
						)}
					</p>
					<div className="flex gap-2">
						<Button onClick={() => helloQuery.refetch()}>
							{t("home.refetch")}
						</Button>
						<Button
							variant="outline"
							disabled={errorMutation.isPending}
							onClick={() => errorMutation.mutate()}
						>
							{t("home.triggerError")}
						</Button>
					</div>
				</CardContent>
			</Card>

			<StorageDemo />
		</div>
	);
}

function StorageDemo() {
	const { t } = useTranslation();
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
				<CardTitle>{t("home.storageTitle")}</CardTitle>
				<CardDescription>{t("home.storageDescription")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 text-sm">
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					className="text-sm"
					disabled={uploading}
					onChange={onFileChange}
				/>
				{uploading && (
					<p className="text-muted-foreground">{t("home.uploading")}</p>
				)}
				{uploaded && (
					<p className="font-mono text-xs break-all text-muted-foreground">
						{uploaded.key}
					</p>
				)}
				{previewUrl && (
					<img
						src={previewUrl}
						alt={t("home.uploadedPreviewAlt")}
						className="max-h-48 rounded-md border"
					/>
				)}
				{error && <p className="text-red-500">{error}</p>}
			</CardContent>
		</Card>
	);
}
