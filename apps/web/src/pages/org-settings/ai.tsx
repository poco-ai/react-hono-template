import type { OrgAiSettingsDto } from "@api/dto/ai.dto";
import { useQuery } from "@tanstack/react-query";
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
import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Progress } from "@workspace/ui/components/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Spinner } from "@workspace/ui/components/spinner";
import { Switch } from "@workspace/ui/components/switch";
import { CircleAlert, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { aiSettingsQuery, useUpdateAiSettings } from "@/features/ai/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

const DEFAULT_MODEL = "__default__";

export function AiSettingsPage({ orgId }: { orgId: string }) {
	const { t, i18n } = useTranslation();
	useDocumentTitle(t("settings.ai"));
	const settings = useQuery(aiSettingsQuery(orgId));
	const { canManage } = useOrgRole(orgId);
	const frozen = useOrgFrozen(orgId);
	const mutation = useUpdateAiSettings(orgId);
	const [draft, setDraft] = useState<OrgAiSettingsDto | null>(null);
	const numberFormat = new Intl.NumberFormat(i18n.language);

	useEffect(() => {
		if (settings.data) {
			setDraft(settings.data.settings);
		}
	}, [settings.data]);

	const readOnly = !canManage || frozen || mutation.isPending;
	const save = () => {
		if (!draft) return;
		mutation.mutate(
			{
				enabled: draft.enabled,
				defaultModel: draft.defaultModel,
				retentionDays: draft.retentionDays,
				strictMcpWrites: draft.strictMcpWrites,
			},
			{
				onSuccess: () => toast.success(t("ai.settings.saved")),
			},
		);
	};

	if (settings.isPending) {
		return (
			<div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
				<Spinner />
				{t("common.loading")}
			</div>
		);
	}
	if (settings.isError) {
		return (
			<Alert variant="destructive">
				<CircleAlert />
				<AlertDescription>
					{apiErrorMessage(t, settings.error)}
				</AlertDescription>
			</Alert>
		);
	}

	const data = settings.data;
	const provider = data.provider;
	const usagePercent =
		data.usage.limits.monthlyTokens > 0
			? Math.min(
					100,
					Math.round(
						(data.usage.totalTokens / data.usage.limits.monthlyTokens) * 100,
					),
				)
			: 0;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="flex items-center gap-2 text-lg font-medium">
						<Sparkles />
						{t("settings.ai")}
					</h2>
					<p className="text-muted-foreground mt-1 text-sm">
						{t("ai.settings.description")}
					</p>
				</div>
				<Badge variant={provider.mock ? "secondary" : "outline"}>
					{provider.mock
						? t("ai.settings.mock")
						: (provider.modelId ?? t("ai.settings.noModel"))}
				</Badge>
			</div>

			{!provider.configured ? (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertTitle>{t("ai.settings.notConfiguredTitle")}</AlertTitle>
					<AlertDescription>
						{t("ai.settings.notConfiguredDescription")}
					</AlertDescription>
				</Alert>
			) : provider.mock ? (
				<Alert>
					<Sparkles />
					<AlertTitle>{t("ai.settings.mockTitle")}</AlertTitle>
					<AlertDescription>
						{t("ai.settings.mockDescription")}
					</AlertDescription>
				</Alert>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>{t("ai.settings.usageTitle")}</CardTitle>
					<CardDescription>{t("ai.usage.month")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-3 text-sm">
						<span>{t("ai.usage.tokens")}</span>
						<span className="font-medium tabular-nums">
							{t("ai.usage.ofLimit", {
								used: numberFormat.format(data.usage.totalTokens),
								limit: numberFormat.format(data.usage.limits.monthlyTokens),
							})}
						</span>
					</div>
					<Progress value={usagePercent} aria-label={t("ai.usage.tokens")} />
					<div className="text-muted-foreground grid grid-cols-3 gap-3 text-xs">
						<span>
							{t("ai.usage.requests")}:{" "}
							<span className="text-foreground tabular-nums">
								{numberFormat.format(data.usage.requests)}
							</span>
						</span>
						<span>
							{t("ai.usage.toolCalls")}:{" "}
							<span className="text-foreground tabular-nums">
								{numberFormat.format(data.usage.toolCalls)}
							</span>
						</span>
						<span>
							{t("ai.settings.planLabel")}:{" "}
							<span className="text-foreground">
								{t(
									data.usage.limits.plan === "pro"
										? "billing.planPro"
										: "billing.planFree",
								)}
							</span>
						</span>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("ai.settings.controlsTitle")}</CardTitle>
					<CardDescription>
						{t("ai.settings.controlsDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium">{t("ai.settings.enabled")}</p>
							<p className="text-muted-foreground text-xs">
								{t("ai.settings.enabledDescription")}
							</p>
						</div>
						<Switch
							checked={draft?.enabled ?? false}
							disabled={readOnly}
							onCheckedChange={(enabled) =>
								setDraft((current) =>
									current ? { ...current, enabled } : current,
								)
							}
						/>
					</div>

					<Field>
						<FieldLabel htmlFor="ai-default-model">
							{t("ai.settings.model")}
						</FieldLabel>
						<Select
							value={draft?.defaultModel ?? DEFAULT_MODEL}
							disabled={readOnly || provider.models.length === 0}
							onValueChange={(value) =>
								setDraft((current) =>
									current
										? {
												...current,
												defaultModel: value === DEFAULT_MODEL ? null : value,
											}
										: current,
								)
							}
						>
							<SelectTrigger id="ai-default-model">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={DEFAULT_MODEL}>
									{t("ai.settings.providerDefault")}
								</SelectItem>
								{provider.models.map((model) => (
									<SelectItem key={model} value={model}>
										{model}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldDescription>
							{t("ai.settings.modelDescription")}
						</FieldDescription>
					</Field>

					<Field>
						<FieldLabel htmlFor="ai-retention">
							{t("ai.settings.retentionDays")}
						</FieldLabel>
						<Input
							id="ai-retention"
							type="number"
							min={1}
							max={3650}
							value={draft?.retentionDays ?? 30}
							disabled={readOnly}
							onChange={(event) =>
								setDraft((current) =>
									current
										? {
												...current,
												retentionDays: Number(event.target.value),
											}
										: current,
								)
							}
						/>
						<FieldDescription>
							{t("ai.settings.retentionDescription")}
						</FieldDescription>
					</Field>

					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium">
								{t("ai.settings.strictMcpWrites")}
							</p>
							<p className="text-muted-foreground text-xs">
								{t("ai.settings.strictMcpWritesDescription")}
							</p>
						</div>
						<Switch
							checked={draft?.strictMcpWrites ?? false}
							disabled={readOnly}
							onCheckedChange={(strictMcpWrites) =>
								setDraft((current) =>
									current ? { ...current, strictMcpWrites } : current,
								)
							}
						/>
					</div>

					{!canManage ? (
						<p className="text-muted-foreground text-xs">
							{t("errors.orgSettingsRequired")}
						</p>
					) : null}
					{mutation.isError ? (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>
								{apiErrorMessage(t, mutation.error)}
							</AlertDescription>
						</Alert>
					) : null}
					<div className="flex justify-end">
						<Button onClick={save} disabled={readOnly || draft === null}>
							{mutation.isPending ? <Spinner /> : null}
							{t("settings.save")}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
