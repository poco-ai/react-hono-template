import type { WebhookDeliveryDto } from "@api/dto/webhook.dto";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "@/lib/format";
import { EventBadge } from "./delivery-badges";

const prettyPayload = (payload: string) => {
	try {
		return JSON.stringify(JSON.parse(payload), null, 2);
	} catch {
		return payload;
	}
};

export function DeliveryDetailDialog({
	delivery,
	onOpenChange,
}: {
	delivery: WebhookDeliveryDto | null;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (delivery) {
			setCopied(false);
		}
	}, [delivery]);

	const hasPayload = Boolean(delivery?.payload.trim());

	const copy = async () => {
		if (!delivery) {
			return;
		}
		await navigator.clipboard.writeText(prettyPayload(delivery.payload));
		setCopied(true);
	};

	return (
		<Dialog open={delivery !== null} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl" closeLabel={t("common.close")}>
				<DialogHeader>
					<DialogTitle>{t("webhooks.detailTitle")}</DialogTitle>
					<DialogDescription className="flex flex-wrap items-center gap-2">
						{delivery && (
							<>
								<EventBadge event={delivery.event} />
								<span>
									{formatRelativeTime(
										delivery.lastAttemptAt ?? delivery.createdAt,
									)}
								</span>
							</>
						)}
					</DialogDescription>
				</DialogHeader>
				{delivery && (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between gap-2">
								<span className="text-muted-foreground text-xs font-medium">
									{t("webhooks.payload")}
								</span>
								{hasPayload && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={copy}
									>
										{copied ? t("common.copied") : t("common.copy")}
									</Button>
								)}
							</div>
							{hasPayload ? (
								<pre className="bg-muted max-h-64 overflow-auto rounded-md border p-3 font-mono text-xs break-words whitespace-pre-wrap">
									{prettyPayload(delivery.payload)}
								</pre>
							) : (
								<p className="text-muted-foreground text-sm">
									{t("webhooks.noPayload")}
								</p>
							)}
						</div>
						{delivery.lastError && (
							<div className="flex flex-col gap-1">
								<span className="text-muted-foreground text-xs font-medium">
									{t("webhooks.errorMessage")}
								</span>
								<p className="text-destructive text-sm break-words">
									{delivery.lastError}
								</p>
							</div>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
