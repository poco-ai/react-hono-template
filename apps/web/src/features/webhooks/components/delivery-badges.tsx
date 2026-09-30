import type { WebhookEventName } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { useTranslation } from "react-i18next";

type WebhookEventLabel = WebhookEventName | "ping";

export function DeliveryStatusBadge({ status }: { status: string }) {
	const { t } = useTranslation();
	if (status === "success") {
		return (
			<Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
				{t("webhooks.statusSuccess")}
			</Badge>
		);
	}
	if (status === "failed") {
		return <Badge variant="destructive">{t("webhooks.statusFailed")}</Badge>;
	}
	return <Badge variant="secondary">{t("webhooks.statusPending")}</Badge>;
}

export function EventBadge({ event }: { event: string }) {
	const { t } = useTranslation();
	return (
		<Badge variant="outline">
			{t(`webhooks.events.${event as WebhookEventLabel}`)}
		</Badge>
	);
}
