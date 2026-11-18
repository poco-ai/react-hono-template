import { useQuery } from "@tanstack/react-query";
import { METER_IDS, QUOTA_MODES } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { MutationError } from "@/components/mutation-error";
import {
	adminQuotaQuery,
	useAdjustOrgCredits,
	useUpdateOrgQuotaPolicy,
} from "@/features/admin/data";
import { useZodForm } from "@/lib/use-zod-form";

const creditSchema = z.object({
	amount: z.coerce
		.number()
		.int()
		.refine((value) => value !== 0),
	reason: z.string().trim().min(1).max(500),
});

const policySchema = z.object({
	meter: z.enum(METER_IDS),
	mode: z.enum(QUOTA_MODES),
	included: z.coerce.number().int().min(-1),
	creditRate: z.coerce.number().int().positive(),
});

export function OrgQuotaDialog({
	orgId,
	orgName,
	open,
	onOpenChange,
}: {
	orgId: string;
	orgName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const overview = useQuery({ ...adminQuotaQuery(orgId), enabled: open });
	const adjust = useAdjustOrgCredits(orgId);
	const [meter, setMeter] = useState<(typeof METER_IDS)[number]>("ai.tokens");
	const current = overview.data?.meters.find((row) => row.meter === meter);
	const credits = useZodForm({
		defaultValues: { amount: "", reason: "" },
		schema: creditSchema,
		t,
		onSubmit: async (values) => {
			await adjust.mutateAsync(values);
		},
	});
	const creditForm = credits.form;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{t("adminOrgs.quotaTitle")} · {orgName}
					</DialogTitle>
				</DialogHeader>
				<p className="text-muted-foreground text-sm">
					{t("quota.available", {
						available: overview.data?.credits.available ?? 0,
					})}
				</p>
				<form className="flex flex-col gap-3" onSubmit={credits.handleSubmit}>
					<Field>
						<FieldLabel>{t("adminOrgs.amount")}</FieldLabel>
						<creditForm.Field name="amount">
							{(field) => (
								<Input
									value={field.state.value}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							)}
						</creditForm.Field>
						<FieldError>{credits.fieldErrors.amount}</FieldError>
					</Field>
					<Field>
						<FieldLabel>{t("adminOrgs.reason")}</FieldLabel>
						<creditForm.Field name="reason">
							{(field) => (
								<Input
									value={field.state.value}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
							)}
						</creditForm.Field>
						<FieldError>{credits.fieldErrors.reason}</FieldError>
					</Field>
					<MutationError error={adjust.error} />
					<Button type="submit" disabled={adjust.isPending}>
						{t("adminOrgs.grant")}
					</Button>
				</form>
				<PolicyForm
					key={`${meter}:${current?.mode ?? ""}:${current?.included ?? ""}:${current?.creditRate ?? ""}`}
					orgId={orgId}
					meter={meter}
					mode={current?.mode ?? "independent"}
					included={current?.included ?? 0}
					creditRate={current?.creditRate ?? 1000}
					onMeterChange={setMeter}
				/>
			</DialogContent>
		</Dialog>
	);
}

function PolicyForm({
	orgId,
	meter,
	mode,
	included,
	creditRate,
	onMeterChange,
}: {
	orgId: string;
	meter: (typeof METER_IDS)[number];
	mode: (typeof QUOTA_MODES)[number];
	included: number;
	creditRate: number;
	onMeterChange: (meter: (typeof METER_IDS)[number]) => void;
}) {
	const { t } = useTranslation();
	const policy = useUpdateOrgQuotaPolicy(orgId);
	const price = useZodForm({
		defaultValues: {
			meter,
			mode,
			included: String(included),
			creditRate: String(creditRate),
		},
		schema: policySchema,
		t,
		onSubmit: async (values) => {
			await policy.mutateAsync(values);
		},
	});

	return (
		<form className="flex flex-col gap-3" onSubmit={price.handleSubmit}>
			<Field>
				<FieldLabel>{t("adminOrgs.meter")}</FieldLabel>
				<Select
					value={meter}
					onValueChange={(value) => {
						if (value === "ai.tokens" || value === "storage.bytes") {
							onMeterChange(value);
						}
					}}
				>
					<SelectTrigger>
						<SelectValue>{t(`quota.meters.${meter}`)}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{METER_IDS.map((id) => (
							<SelectItem key={id} value={id}>
								{t(`quota.meters.${id}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<price.form.Field name="mode">
				{(field) => (
					<Field>
						<FieldLabel>{t("quota.modeLabel")}</FieldLabel>
						<Select
							value={field.state.value}
							onValueChange={(value) => {
								if (
									value === "independent" ||
									value === "pooled" ||
									value === "hybrid"
								) {
									field.handleChange(value);
								}
							}}
						>
							<SelectTrigger>
								<SelectValue>
									{t(`quota.mode.${field.state.value}`)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{QUOTA_MODES.map((item) => (
									<SelectItem key={item} value={item}>
										{t(`quota.mode.${item}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				)}
			</price.form.Field>
			<Field>
				<FieldLabel>{t("adminOrgs.included")}</FieldLabel>
				<price.form.Field name="included">
					{(field) => (
						<Input
							value={field.state.value}
							onChange={(event) => field.handleChange(event.target.value)}
						/>
					)}
				</price.form.Field>
			</Field>
			<Field>
				<FieldLabel>{t("adminOrgs.creditRate")}</FieldLabel>
				<price.form.Field name="creditRate">
					{(field) => (
						<Input
							value={field.state.value}
							onChange={(event) => field.handleChange(event.target.value)}
						/>
					)}
				</price.form.Field>
			</Field>
			<MutationError error={policy.error} />
			<DialogFooter>
				<Button type="submit" disabled={policy.isPending}>
					{t("adminOrgs.savePolicy")}
				</Button>
			</DialogFooter>
		</form>
	);
}
