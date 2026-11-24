import type {
	WebhookDeliveryDto,
	WebhookDto,
} from "@api/features/webhooks/dto/webhook.dto";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Spinner } from "@workspace/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MutationError } from "@/components/mutation-error";
import { TablePagination } from "@/components/table-pagination";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import {
	useRedeliverWebhook,
	webhookDeliveriesQuery,
} from "@/features/webhooks/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/format";
import { pageCount } from "@/lib/pagination";
import { DeliveryStatusBadge, EventBadge } from "./delivery-badges";
import { DeliveryDetailDialog } from "./delivery-detail-dialog";

export function DeliveriesDialog({
	orgId,
	webhook,
	onOpenChange,
}: {
	orgId: string;
	webhook: WebhookDto | null;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();

	const frozen = useOrgFrozen(orgId);
	const [page, setPage] = useState(1);
	const [redelivering, setRedelivering] = useState<string | null>(null);
	const [detail, setDetail] = useState<WebhookDeliveryDto | null>(null);

	useEffect(() => {
		if (webhook) {
			setPage(1);
			setRedelivering(null);
		}
		setDetail(null);
	}, [webhook]);

	const deliveries = useQuery({
		...webhookDeliveriesQuery(orgId, webhook?.id ?? "", page),
		enabled: webhook !== null,
		refetchInterval: (query) =>
			query.state.data?.items.some((item) => item.status === "pending")
				? 3000
				: false,
	});

	const redeliverMutation = useRedeliverWebhook(orgId, {
		onMutate: (deliveryId) => setRedelivering(deliveryId),
		onSettled: () => setRedelivering(null),
	});

	const totalPages = deliveries.data ? pageCount(deliveries.data) : 1;

	return (
		<Dialog open={webhook !== null} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl" closeLabel={t("common.close")}>
				<DialogHeader>
					<DialogTitle>{t("webhooks.deliveriesTitle")}</DialogTitle>
					<DialogDescription className="truncate font-mono text-xs">
						{webhook?.url}
					</DialogDescription>
				</DialogHeader>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("webhooks.event")}</TableHead>
							<TableHead>{t("webhooks.status")}</TableHead>
							<TableHead className="hidden sm:table-cell">
								{t("webhooks.responseStatus")}
							</TableHead>
							<TableHead className="hidden sm:table-cell">
								{t("webhooks.attempts")}
							</TableHead>
							<TableHead className="hidden md:table-cell">
								{t("webhooks.time")}
							</TableHead>
							<TableHead className="text-right">
								{t("common.actions")}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{deliveries.data?.items.map((delivery: WebhookDeliveryDto) => (
							<TableRow
								key={delivery.id}
								className="cursor-pointer hover:bg-accent/40"
								onClick={() => setDetail(delivery)}
							>
								<TableCell>
									<EventBadge event={delivery.event} />
								</TableCell>
								<TableCell>
									<DeliveryStatusBadge status={delivery.status} />
								</TableCell>
								<TableCell className="hidden font-mono text-xs sm:table-cell">
									{delivery.responseStatus ?? "—"}
								</TableCell>
								<TableCell className="hidden sm:table-cell">
									{delivery.attempts}
								</TableCell>
								<TableCell className="hidden text-muted-foreground text-xs md:table-cell">
									{formatRelativeTime(
										delivery.lastAttemptAt ?? delivery.createdAt,
									)}
								</TableCell>
								<TableCell className="text-right">
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("webhooks.redeliver")}
										disabled={frozen || redelivering !== null}
										onClick={(e) => {
											e.stopPropagation();
											redeliverMutation.mutate(delivery.id);
										}}
									>
										{redelivering === delivery.id ? <Spinner /> : <RefreshCw />}
									</Button>
								</TableCell>
							</TableRow>
						))}
						{deliveries.isPending && (
							<TableRow>
								<TableCell
									colSpan={6}
									className="text-muted-foreground h-16 text-center"
								>
									{t("common.loading")}
								</TableCell>
							</TableRow>
						)}
						{deliveries.isError && (
							<TableRow>
								<TableCell colSpan={6} className="text-center text-destructive">
									{apiErrorMessage(t, deliveries.error)}
								</TableCell>
							</TableRow>
						)}
						{!deliveries.isPending && deliveries.data?.items.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={6}
									className="text-muted-foreground h-16 text-center"
								>
									{t("webhooks.deliveriesEmpty")}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
				{redeliverMutation.isError && (
					<MutationError error={redeliverMutation.error} />
				)}
				<div className="flex items-center justify-end text-sm">
					<TablePagination
						page={page}
						total={deliveries.data?.total}
						totalPages={totalPages}
						onPageChange={setPage}
						disabled={deliveries.isPending}
					/>
				</div>
			</DialogContent>
			<DeliveryDetailDialog
				delivery={detail}
				onOpenChange={(open) => !open && setDetail(null)}
			/>
		</Dialog>
	);
}
