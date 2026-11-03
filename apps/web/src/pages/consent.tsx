import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { Spinner } from "@workspace/ui/components/spinner";
import { CircleAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PublicAuthScreen } from "@/components/public-auth-screen";
import { sessionOptions } from "@/features/auth/data";
import { submitOAuthConsent } from "@/features/mcp/data";

export function ConsentPage() {
	const { t } = useTranslation();
	const session = useQuery(sessionOptions);
	const [pending, setPending] = useState<"accept" | "deny" | null>(null);
	const [error, setError] = useState<string | null>(null);

	const params = useMemo(() => new URLSearchParams(window.location.search), []);
	const clientId = params.get("client_id") ?? t("mcp.consent.unknownClient");
	const scopes = useMemo(
		() =>
			(params.get("scope") ?? "")
				.split(/\s+/)
				.map((scope) => scope.trim())
				.filter(Boolean),
		[params],
	);
	const oauthQuery =
		params.get("oauth_query") ?? window.location.search.slice(1);

	const decide = async (accept: boolean) => {
		setPending(accept ? "accept" : "deny");
		setError(null);
		try {
			const result = await submitOAuthConsent({ accept, oauthQuery });
			window.location.assign(result.url);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : t("mcp.consent.failed"),
			);
			setPending(null);
		}
	};

	return (
		<PublicAuthScreen title={t("mcp.consent.title")}>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheck />
						{t("mcp.consent.title")}
					</CardTitle>
					<CardDescription>{t("mcp.consent.description")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{session.isPending ? (
						<div className="text-muted-foreground flex items-center gap-2 text-sm">
							<Spinner />
							{t("common.loading")}
						</div>
					) : !session.data ? (
						<Alert>
							<CircleAlert />
							<AlertTitle>{t("mcp.consent.signInTitle")}</AlertTitle>
							<AlertDescription>
								{t("mcp.consent.signInDescription")}
							</AlertDescription>
							<Button
								className="mt-3"
								render={
									<Link
										to="/login"
										search={{ redirect: window.location.href }}
									/>
								}
							>
								{t("login.title")}
							</Button>
						</Alert>
					) : (
						<>
							<div className="flex flex-col gap-1">
								<span className="text-muted-foreground text-xs">
									{t("mcp.consent.client")}
								</span>
								<code className="bg-muted overflow-x-auto rounded-md px-2 py-1.5 text-xs">
									{clientId}
								</code>
							</div>
							<div className="flex flex-col gap-2">
								<span className="text-muted-foreground text-xs">
									{t("mcp.consent.scopes")}
								</span>
								<div className="flex flex-wrap gap-1.5">
									{scopes.length > 0 ? (
										scopes.map((scope) => (
											<Badge key={scope} variant="outline">
												{scope}
											</Badge>
										))
									) : (
										<span className="text-muted-foreground text-xs">
											{t("mcp.consent.noScopes")}
										</span>
									)}
								</div>
							</div>
							{error ? (
								<Alert variant="destructive">
									<CircleAlert />
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							) : null}
							<div className="flex flex-col gap-2 sm:flex-row">
								<Button
									className="flex-1"
									disabled={pending !== null}
									onClick={() => void decide(true)}
								>
									{pending === "accept" ? <Spinner /> : null}
									{t("mcp.consent.approve")}
								</Button>
								<Button
									variant="outline"
									className="flex-1"
									disabled={pending !== null}
									onClick={() => void decide(false)}
								>
									{pending === "deny" ? <Spinner /> : null}
									{t("mcp.consent.deny")}
								</Button>
							</div>
							<p className="text-muted-foreground text-xs">
								{t("mcp.consent.revokeHint")}
							</p>
						</>
					)}
				</CardContent>
			</Card>
		</PublicAuthScreen>
	);
}
