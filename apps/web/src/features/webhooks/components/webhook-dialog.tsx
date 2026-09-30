import type { WebhookDto } from "@api/dto/webhook.dto";
import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { QuotaError } from "@/components/quota-error";
import { SecretReveal } from "@/components/secret-reveal";
import { useSession } from "@/features/auth/data";
import { MANAGE_ROLES, membersQuery } from "@/features/members/data";
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
	const { data: session } = useSession();
	const members = useQuery(membersQuery(orgId));
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

	const myRole = members.data?.find((m) => m.userId === session?.user.id)?.role;
	const canManage =
		myRole !== undefined && (MANAGE_ROLES as string[]).includes(myRole);

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
						<div className="flex flex-col gap-2">
							<Label htmlFor="webhook-url">{t("webhooks.url")}</Label>
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
							{fieldErrors.url && (
								<p id="webhook-url-error" className="text-destructive text-sm">
									{fieldErrors.url}
								</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("webhooks.eventsLabel")}</Label>
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
							{fieldErrors.events && (
								<p
									id="webhook-events-error"
									className="text-destructive text-sm"
								>
									{fieldErrors.events}
								</p>
							)}
						</div>
						{webhook && (
							<div className="flex items-center justify-between">
								<Label htmlFor="webhook-active">{t("webhooks.active")}</Label>
								<Switch
									id="webhook-active"
									checked={active}
									onCheckedChange={(v) => setActive(v === true)}
								/>
							</div>
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
