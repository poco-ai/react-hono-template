import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	CircleAlert,
	Copy,
	KeyRound,
	ShieldCheck,
	Terminal,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { mcpInfoQuery } from "@/features/mcp/data";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

function CopyButton({ value }: { value: string }) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			variant="outline"
			size="xs"
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(value);
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1600);
				} catch {
					toast.error(t("common.copyFailed"));
				}
			}}
		>
			<Copy />
			{copied ? t("common.copied") : t("common.copy")}
		</Button>
	);
}

function CodeSnippet({ code }: { code: string }) {
	const { t } = useTranslation();
	return (
		<div className="bg-muted/50 relative overflow-hidden rounded-lg border">
			<div className="flex items-center justify-between border-b px-3 py-1.5">
				<span className="text-muted-foreground font-mono text-[10px] uppercase">
					{t("mcp.snippet")}
				</span>
				<CopyButton value={code} />
			</div>
			<pre className="overflow-x-auto p-3 text-xs">
				<code>{code}</code>
			</pre>
		</div>
	);
}

export function McpSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.mcp"));
	const { orgId: routeOrgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const info = useQuery(mcpInfoQuery(routeOrgId || orgId));
	const { canManage } = useOrgRole(orgId);

	if (info.isPending) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-40 w-full" />
			</div>
		);
	}
	if (info.isError) {
		return (
			<Alert variant="destructive">
				<CircleAlert />
				<AlertDescription>{apiErrorMessage(t, info.error)}</AlertDescription>
			</Alert>
		);
	}

	const data = info.data;
	const apiKeySnippet = JSON.stringify(
		{
			mcpServers: {
				"issue-tracker": {
					type: "http",
					url: data.endpoint,
					headers: { Authorization: "Bearer sk_..." },
				},
			},
		},
		null,
		2,
	);
	const oauthSnippet = JSON.stringify(
		{
			mcpServers: {
				"issue-tracker": {
					type: "http",
					url: data.endpoint,
				},
			},
		},
		null,
		2,
	);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-medium">
						<Terminal />
						{t("settings.mcp")}
					</h2>
					<p className="text-muted-foreground mt-1 text-sm">
						{t("mcp.description")}
					</p>
				</div>
				<Badge variant={data.enabled ? "default" : "secondary"}>
					{data.enabled ? t("mcp.enabled") : t("mcp.disabled")}
				</Badge>
			</div>

			{!data.enabled ? (
				<Alert>
					<CircleAlert />
					<AlertTitle>{t("mcp.disabledTitle")}</AlertTitle>
					<AlertDescription>{t("mcp.disabledDescription")}</AlertDescription>
				</Alert>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>{t("mcp.endpointTitle")}</CardTitle>
					<CardDescription>{t("mcp.endpointDescription")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<code className="bg-muted min-w-0 flex-1 overflow-x-auto rounded-md px-3 py-2 text-xs">
							{data.endpoint}
						</code>
						<CopyButton value={data.endpoint} />
					</div>
					<p className="text-muted-foreground text-xs">
						{t("mcp.transport")}: {data.transport}
					</p>
				</CardContent>
			</Card>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<KeyRound />
							{t("mcp.apiKeyTitle")}
						</CardTitle>
						<CardDescription>{t("mcp.apiKeyDescription")}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<div className="flex flex-wrap gap-1.5">
							{data.scopes.apiKey.map((scope) => (
								<Badge key={scope} variant="outline">
									{scope}
								</Badge>
							))}
						</div>
						<CodeSnippet code={apiKeySnippet} />
						<Button
							variant="outline"
							size="sm"
							render={
								<Link to="/orgs/$orgId/settings/api-keys" params={{ orgId }} />
							}
						>
							<KeyRound />
							{t("mcp.createKey")}
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ShieldCheck />
							{t("mcp.oauthTitle")}
						</CardTitle>
						<CardDescription>{t("mcp.oauthDescription")}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<div className="flex flex-wrap gap-1.5">
							{data.scopes.oauth.map((scope) => (
								<Badge key={scope} variant="outline">
									{scope}
								</Badge>
							))}
						</div>
						<CodeSnippet code={oauthSnippet} />
						<p className="text-muted-foreground text-xs">
							{t("mcp.dcr")}:{" "}
							{data.oauth.dynamicClientRegistration
								? t("common.enabled")
								: t("common.disabled")}
						</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t("mcp.instructionsTitle")}</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="text-muted-foreground list-disc pl-5 text-sm">
						<li>{t("mcp.instructions.apiKey")}</li>
						<li>{t("mcp.instructions.oauth")}</li>
						<li>{t("mcp.instructions.orgId")}</li>
					</ul>
					{!canManage ? (
						<p className="text-muted-foreground mt-3 text-xs">
							{t("mcp.adminOnly")}
						</p>
					) : null}
				</CardContent>
			</Card>

			<Alert>
				<ShieldCheck />
				<AlertTitle>{t("mcp.securityTitle")}</AlertTitle>
				<AlertDescription>{t("mcp.securityDescription")}</AlertDescription>
			</Alert>
		</div>
	);
}
