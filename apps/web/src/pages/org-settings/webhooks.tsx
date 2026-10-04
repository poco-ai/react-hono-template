import type { WebhookDto } from "@api/dto/webhook.dto";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { CircleAlert, Inbox, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { DeliveriesDialog } from "@/features/webhooks/components/deliveries-dialog";
import { EventBadge } from "@/features/webhooks/components/delivery-badges";
import { WebhookDialog } from "@/features/webhooks/components/webhook-dialog";
import {
	useDeleteWebhook,
	usePingWebhook,
	useToggleWebhook,
	webhooksQuery,
} from "@/features/webhooks/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";

export function WebhooksSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.webhooks"));

	const webhooks = useQuery(webhooksQuery(orgId));
	const frozen = useOrgFrozen(orgId);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<WebhookDto | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<WebhookDto | null>(null);
	const [deliveriesTarget, setDeliveriesTarget] = useState<WebhookDto | null>(
		null,
	);

	const toggleMutation = useToggleWebhook(orgId, {});

	const deleteMutation = useDeleteWebhook(orgId, {
		onSuccess: () => {
			toast.success(t("toast.webhookDeleted"));

			setDeleteTarget(null);
		},
	});

	const pingMutation = usePingWebhook(orgId, {
		onSuccess: () => {
			toast.success(t("toast.webhookPinged"));
		},
	});

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-medium">{t("settings.webhooks")}</h2>
				<Button
					onClick={() => {
						setEditing(null);
						setDialogOpen(true);
					}}
					disabled={frozen}
				>
					<Plus />
					{t("webhooks.create")}
				</Button>
			</div>

			{pingMutation.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, pingMutation.error)}
					</AlertDescription>
				</Alert>
			)}

			<Table>
				{!(webhooks.data?.length === 0 && !webhooks.isPending) && (
					<TableHeader>
						<TableRow>
							<TableHead>{t("webhooks.url")}</TableHead>
							<TableHead>{t("webhooks.eventsLabel")}</TableHead>
							<TableHead className="w-20">{t("webhooks.active")}</TableHead>
							<TableHead>{t("apiKeys.created")}</TableHead>
							<TableHead className="text-right">
								{t("common.actions")}
							</TableHead>
						</TableRow>
					</TableHeader>
				)}
				<TableBody>
					{webhooks.data?.map((webhook) => (
						<TableRow key={webhook.id}>
							<TableCell className="max-w-60">
								<span className="block truncate font-mono text-xs">
									{webhook.url}
								</span>
							</TableCell>
							<TableCell>
								<div className="flex flex-wrap gap-1">
									{webhook.events.map((event) => (
										<EventBadge key={event} event={event} />
									))}
								</div>
							</TableCell>
							<TableCell>
								<Switch
									aria-label={t("webhooks.activeLabel", { url: webhook.url })}
									checked={webhook.active}
									disabled={frozen || toggleMutation.isPending}
									onCheckedChange={(active) =>
										toggleMutation.mutate({ id: webhook.id, active })
									}
								/>
							</TableCell>
							<TableCell className="text-muted-foreground text-xs">
								{formatDate(webhook.createdAt)}
							</TableCell>
							<TableCell className="text-right">
								<div className="flex items-center justify-end gap-1">
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={t("webhooks.pingLabel")}
													disabled={frozen || pingMutation.isPending}
													onClick={() => pingMutation.mutate(webhook.id)}
												>
													<Zap />
												</Button>
											}
										/>
										<TooltipContent>{t("webhooks.pingLabel")}</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={t("webhooks.deliveries")}
													onClick={() => setDeliveriesTarget(webhook)}
												>
													<Inbox />
												</Button>
											}
										/>
										<TooltipContent>{t("webhooks.deliveries")}</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={t("common.edit")}
													disabled={frozen}
													onClick={() => {
														setEditing(webhook);
														setDialogOpen(true);
													}}
												>
													<Pencil />
												</Button>
											}
										/>
										<TooltipContent>{t("common.edit")}</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													className="text-destructive hover:text-destructive"
													aria-label={t("common.delete")}
													disabled={frozen}
													onClick={() => setDeleteTarget(webhook)}
												>
													<Trash2 />
												</Button>
											}
										/>
										<TooltipContent>{t("common.delete")}</TooltipContent>
									</Tooltip>
								</div>
							</TableCell>
						</TableRow>
					))}
					{webhooks.isPending && (
						<TableRow>
							<TableCell
								colSpan={5}
								className="text-muted-foreground h-16 text-center"
							>
								{t("common.loading")}
							</TableCell>
						</TableRow>
					)}
					{webhooks.isError && (
						<TableRow>
							<TableCell colSpan={5} className="text-center text-red-500">
								{apiErrorMessage(t, webhooks.error)}
							</TableCell>
						</TableRow>
					)}
					{webhooks.data?.length === 0 && !webhooks.isPending && (
						<TableRow>
							<TableCell colSpan={5} className="p-0">
								<EmptyState title={t("webhooks.empty")} />
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			{(toggleMutation.isError || deleteMutation.isError) && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>
						{(toggleMutation.error ?? deleteMutation.error)?.message}
					</AlertDescription>
				</Alert>
			)}

			<WebhookDialog
				orgId={orgId}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				webhook={editing}
			/>

			<DeliveriesDialog
				orgId={orgId}
				webhook={deliveriesTarget}
				onOpenChange={(open) => !open && setDeliveriesTarget(null)}
			/>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("webhooks.deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("webhooks.deleteDescription", {
								url: deleteTarget?.url ?? "",
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								if (deleteTarget) {
									deleteMutation.mutate(deleteTarget.id);
								}
							}}
						>
							{t("common.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
