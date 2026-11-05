import type { WebhookDto } from "@api/dto/webhook.dto";
import {
	type CreateWebhookInput,
	createWebhookSchema,
	WEBHOOK_EVENTS,
	type WebhookEventName,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { QuotaError } from "@/components/quota-error";
import { SecretReveal } from "@/components/secret-reveal";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { useSaveWebhook } from "@/features/webhooks/data";
import { useZodForm } from "@/lib/use-zod-form";

type WebhookFormValues = {
	url: string;
	events: WebhookEventName[];
};

const formSchema = z.preprocess((values) => {
	// Guard non-object input so the wrapper cannot throw a TypeError before zod
	// gets a chance to report validation issues.
	if (!values || typeof values !== "object") {
		return values;
	}
	const { url, events } = values as WebhookFormValues;
	return {
		url: url.trim(),
		events,
	};
}, createWebhookSchema);

const INPUT_IDS = { url: "webhook-url" };

const PATTERN_KEYS = {
	url: "form.errors.url",
	events: "webhooks.eventsMinError",
};

export function WebhookDialog({
	orgId,
	open,
	onOpenChange,
	webhook,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	webhook: WebhookDto | null;
}) {
	const { t } = useTranslation();
	const { canManage } = useOrgRole(orgId);
	const [active, setActive] = useState(true);
	const [createdSecret, setCreatedSecret] = useState<string | null>(null);

	const saveMutation = useSaveWebhook(orgId, webhook?.id, {
		onSuccess: (saved) => {
			toast.success(
				t(webhook ? "toast.webhookUpdated" : "toast.webhookCreated"),
			);

			if (!webhook && "secret" in saved) {
				setCreatedSecret(saved.secret as string);
			} else {
				onOpenChange(false);
			}
		},
	});

	const { form, fieldErrors, handleSubmit, reset } = useZodForm<
		WebhookFormValues,
		CreateWebhookInput
	>({
		defaultValues: { url: "", events: [] },
		schema: formSchema,
		onSubmit: (values) => {
			saveMutation.mutate({ ...values, active });
		},
		t,
		patternKeys: PATTERN_KEYS,
		inputIds: INPUT_IDS,
	});

	useEffect(() => {
		if (open) {
			reset({
				url: webhook?.url ?? "",
				events: (webhook?.events ?? []) as WebhookEventName[],
			});
			setActive(webhook?.active ?? true);
			setCreatedSecret(null);
		}
	}, [open, webhook, reset]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{createdSecret
							? t("webhooks.secretTitle")
							: webhook
								? t("webhooks.editTitle")
								: t("webhooks.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{createdSecret
							? t("webhooks.secretWarning")
							: t("webhooks.createDescription")}
					</DialogDescription>
				</DialogHeader>
				{createdSecret ? (
					<div className="flex flex-col gap-3">
						<SecretReveal value={createdSecret} />
						<DialogFooter>
							<Button type="button" onClick={() => onOpenChange(false)}>
								{t("common.done")}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<form
						noValidate
						className="flex flex-col gap-4"
						onSubmit={handleSubmit}
					>
						<form.Field name="url">
							{(field) => (
								<Field data-invalid={fieldErrors.url ? true : undefined}>
									<FieldLabel htmlFor="webhook-url">
										{t("webhooks.url")}
									</FieldLabel>
									<Input
										id="webhook-url"
										type="url"
										value={field.state.value}
										placeholder={t("webhooks.urlPlaceholder")}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={fieldErrors.url ? true : undefined}
										aria-describedby={
											fieldErrors.url ? "webhook-url-error" : undefined
										}
									/>
									<FieldError id="webhook-url-error">
										{fieldErrors.url}
									</FieldError>
								</Field>
							)}
						</form.Field>
						<form.Field name="events">
							{(field) => (
								<Field data-invalid={fieldErrors.events ? true : undefined}>
									<FieldLabel>{t("webhooks.eventsLabel")}</FieldLabel>
									<div
										className="grid grid-cols-1 gap-2"
										aria-describedby={
											fieldErrors.events ? "webhook-events-error" : undefined
										}
									>
										{WEBHOOK_EVENTS.map((event) => (
											<label
												key={event}
												htmlFor={`webhook-event-${event}`}
												className="flex cursor-pointer items-center gap-2 text-sm"
											>
												<Checkbox
													id={`webhook-event-${event}`}
													checked={field.state.value.includes(event)}
													onCheckedChange={(checked) =>
														field.handleChange(
															checked === true
																? [...field.state.value, event]
																: field.state.value.filter((e) => e !== event),
														)
													}
												/>
												{t(`webhooks.events.${event}`)}
											</label>
										))}
									</div>
									<FieldError id="webhook-events-error">
										{fieldErrors.events}
									</FieldError>
								</Field>
							)}
						</form.Field>
						{webhook && (
							<Field
								orientation="horizontal"
								className="items-center justify-between"
							>
								<FieldLabel htmlFor="webhook-active">
									{t("webhooks.active")}
								</FieldLabel>
								<Switch
									id="webhook-active"
									checked={active}
									onCheckedChange={(v) => setActive(v === true)}
								/>
							</Field>
						)}
						{saveMutation.isError && (
							<QuotaError
								error={saveMutation.error}
								orgId={orgId}
								canUpgrade={canManage}
							/>
						)}
						<DialogFooter>
							<Button type="submit" disabled={saveMutation.isPending}>
								{webhook ? t("common.save") : t("common.create")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
