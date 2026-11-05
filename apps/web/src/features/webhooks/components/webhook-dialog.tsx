import type { WebhookDto } from "@api/dto/webhook.dto";
import {
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
import { QuotaError } from "@/components/quota-error";
import { SecretReveal } from "@/components/secret-reveal";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { useSaveWebhook } from "@/features/webhooks/data";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";

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
	const [url, setUrl] = useState("");
	const [events, setEvents] = useState<string[]>([]);
	const [active, setActive] = useState(true);
	const [createdSecret, setCreatedSecret] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	useEffect(() => {
		if (open) {
			setUrl(webhook?.url ?? "");
			setEvents(webhook?.events ?? []);
			setActive(webhook?.active ?? true);
			setCreatedSecret(null);
			setFieldErrors({});
		}
	}, [open, webhook]);

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

	const toggleEvent = (event: WebhookEventName, checked: boolean) => {
		setEvents((prev) =>
			checked ? [...prev, event] : prev.filter((e) => e !== event),
		);
		setFieldErrors((prev) => withoutFieldError(prev, "events"));
	};

	const onUrlChange = (next: string) => {
		setUrl(next);
		setFieldErrors((prev) => withoutFieldError(prev, "url"));
	};

	const onSubmit = () => {
		const parsed = createWebhookSchema.safeParse({
			url: url.trim(),
			events,
		});
		if (!parsed.success) {
			const errors = fieldErrorsFromZod(parsed.error, t, {
				url: "form.errors.url",
				events: "webhooks.eventsMinError",
			});
			setFieldErrors(errors);
			focusFirstInvalidField(errors, { url: "webhook-url" });
			return;
		}
		saveMutation.mutate({
			url: parsed.data.url,
			events: parsed.data.events,
			active,
		});
	};

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
						onSubmit={(e) => {
							e.preventDefault();
							onSubmit();
						}}
					>
						<Field data-invalid={fieldErrors.url ? true : undefined}>
							<FieldLabel htmlFor="webhook-url">{t("webhooks.url")}</FieldLabel>
							<Input
								id="webhook-url"
								type="url"
								value={url}
								placeholder={t("webhooks.urlPlaceholder")}
								onChange={(e) => onUrlChange(e.target.value)}
								aria-invalid={fieldErrors.url ? true : undefined}
								aria-describedby={
									fieldErrors.url ? "webhook-url-error" : undefined
								}
							/>
							<FieldError id="webhook-url-error">{fieldErrors.url}</FieldError>
						</Field>
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
											checked={events.includes(event)}
											onCheckedChange={(checked) =>
												toggleEvent(event, checked === true)
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
