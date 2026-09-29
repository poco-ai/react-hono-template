import type { WebhookDeliveryDto, WebhookDto } from "@api/dto/webhook.dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WebhookEventName } from "@workspace/shared";
import { WEBHOOK_EVENTS } from "@workspace/shared";
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
import { Badge } from "@workspace/ui/components/badge";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import {
	CircleAlert,
	Inbox,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	Trash2,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QuotaError } from "@/components/quota-error";
import { client, unwrap } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/issue-utils";
import { MANAGE_ROLES, membersQuery } from "@/lib/queries/members";
import {
	webhookDeliveriesQuery,
	webhookDeliveriesRootKey,
	webhooksKey,
	webhooksQuery,
} from "@/lib/queries/webhooks";
import { useSession } from "@/lib/session";
import { useDocumentTitle } from "@/lib/use-document-title";

type WebhookEventLabel = WebhookEventName | "ping";

const MIN_EVENTS = 1;

function DeliveryStatusBadge({ status }: { status: string }) {
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

function EventBadge({ event }: { event: string }) {
	const { t } = useTranslation();
	return (
		<Badge variant="outline">
			{t(`webhooks.events.${event as WebhookEventLabel}`)}
		</Badge>
	);
}

export function WebhooksSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.webhooks"));
	const queryClient = useQueryClient();
	const webhooks = useQuery(webhooksQuery(orgId));
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<WebhookDto | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<WebhookDto | null>(null);
	const [deliveriesTarget, setDeliveriesTarget] = useState<WebhookDto | null>(
		null,
	);
	const [pingNotice, setPingNotice] = useState<string | null>(null);

	useEffect(() => {
		if (!pingNotice) {
			return;
		}
		const timer = setTimeout(() => setPingNotice(null), 4000);
		return () => clearTimeout(timer);
	}, [pingNotice]);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: webhooksKey(orgId) });

	const toggleMutation = useMutation({
		mutationFn: ({ id, active }: { id: string; active: boolean }) =>
			unwrap(
				client.api.orgs[":orgId"].webhooks[":webhookId"].$patch({
					param: { orgId, webhookId: id },
					json: { active },
				}),
			),
		onSuccess: invalidate,
	});

	const deleteMutation = useMutation({
		mutationFn: (webhookId: string) =>
			unwrap(
				client.api.orgs[":orgId"].webhooks[":webhookId"].$delete({
					param: { orgId, webhookId },
				}),
			),
		onSuccess: () => {
			invalidate();
			setDeleteTarget(null);
		},
	});

	const pingMutation = useMutation({
		mutationFn: (webhookId: string) =>
			unwrap(
				client.api.orgs[":orgId"].webhooks[":webhookId"].ping.$post({
					param: { orgId, webhookId },
				}),
			),
		onSuccess: (_, webhookId) => {
			setPingNotice(webhookId);
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
				>
					<Plus />
					{t("webhooks.create")}
				</Button>
			</div>

			{pingMutation.isSuccess && pingNotice && (
				<p className="text-sm text-emerald-600 dark:text-emerald-400">
					{t("webhooks.pingSent")}
				</p>
			)}
			{pingMutation.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>{pingMutation.error.message}</AlertDescription>
				</Alert>
			)}

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("webhooks.url")}</TableHead>
						<TableHead>{t("webhooks.eventsLabel")}</TableHead>
						<TableHead className="w-20">{t("webhooks.active")}</TableHead>
						<TableHead>{t("apiKeys.created")}</TableHead>
						<TableHead className="text-right">{t("common.actions")}</TableHead>
					</TableRow>
				</TableHeader>
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
									disabled={toggleMutation.isPending}
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
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("webhooks.ping")}
										disabled={pingMutation.isPending}
										onClick={() => pingMutation.mutate(webhook.id)}
									>
										<Zap />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("webhooks.deliveries")}
										onClick={() => setDeliveriesTarget(webhook)}
									>
										<Inbox />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("common.edit")}
										onClick={() => {
											setEditing(webhook);
											setDialogOpen(true);
										}}
									>
										<Pencil />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										className="text-destructive hover:text-destructive"
										aria-label={t("common.delete")}
										onClick={() => setDeleteTarget(webhook)}
									>
										<Trash2 />
									</Button>
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
								{webhooks.error.message}
							</TableCell>
						</TableRow>
					)}
					{!webhooks.isPending && webhooks.data?.length === 0 && (
						<TableRow>
							<TableCell
								colSpan={5}
								className="text-muted-foreground h-16 text-center"
							>
								{t("webhooks.empty")}
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
				onSaved={invalidate}
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

function WebhookDialog({
	orgId,
	open,
	onOpenChange,
	webhook,
	onSaved,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	webhook: WebhookDto | null;
	onSaved: () => void;
}) {
	const { t } = useTranslation();
	const { data: session } = useSession();
	const members = useQuery(membersQuery(orgId));
	const [url, setUrl] = useState("");
	const [events, setEvents] = useState<string[]>([]);
	const [active, setActive] = useState(true);
	const [createdSecret, setCreatedSecret] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (open) {
			setUrl(webhook?.url ?? "");
			setEvents(webhook?.events ?? []);
			setActive(webhook?.active ?? true);
			setCreatedSecret(null);
			setCopied(false);
		}
	}, [open, webhook]);

	const saveMutation = useMutation({
		mutationFn: (input: {
			url: string;
			events: WebhookEventName[];
			active?: boolean;
		}) =>
			webhook
				? unwrap(
						client.api.orgs[":orgId"].webhooks[":webhookId"].$patch({
							param: { orgId, webhookId: webhook.id },
							json: input,
						}),
					)
				: unwrap(
						client.api.orgs[":orgId"].webhooks.$post({
							param: { orgId },
							json: { url: input.url, events: input.events },
						}),
					),
		onSuccess: (saved) => {
			onSaved();
			if (!webhook && "secret" in saved) {
				setCreatedSecret(saved.secret as string);
				setCopied(false);
			} else {
				onOpenChange(false);
			}
		},
	});

	const toggleEvent = (event: WebhookEventName, checked: boolean) => {
		setEvents((prev) =>
			checked ? [...prev, event] : prev.filter((e) => e !== event),
		);
	};

	const copySecret = async () => {
		if (!createdSecret) {
			return;
		}
		await navigator.clipboard.writeText(createdSecret);
		setCopied(true);
	};

	const canSubmit = url.trim().length > 0 && events.length >= MIN_EVENTS;

	const myRole = members.data?.find((m) => m.userId === session?.user.id)?.role;
	const canManage =
		myRole !== undefined && (MANAGE_ROLES as string[]).includes(myRole);

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
						<div className="flex gap-2">
							<Input
								readOnly
								value={createdSecret}
								className="font-mono text-xs"
							/>
							<Button type="button" variant="outline" onClick={copySecret}>
								{copied ? t("common.copied") : t("common.copy")}
							</Button>
						</div>
						<DialogFooter>
							<Button type="button" onClick={() => onOpenChange(false)}>
								{t("common.done")}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							if (canSubmit) {
								saveMutation.mutate({
									url: url.trim(),
									events: events as WebhookEventName[],
									active,
								});
							}
						}}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="webhook-url">{t("webhooks.url")}</Label>
							<Input
								id="webhook-url"
								type="url"
								value={url}
								placeholder={t("webhooks.urlPlaceholder")}
								onChange={(e) => setUrl(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("webhooks.eventsLabel")}</Label>
							<div className="grid grid-cols-1 gap-2">
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
							{events.length > 0 && events.length < MIN_EVENTS && (
								<p className="text-destructive text-xs">
									{t("webhooks.eventsMinError")}
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

function DeliveriesDialog({
	orgId,
	webhook,
	onOpenChange,
}: {
	orgId: string;
	webhook: WebhookDto | null;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [page, setPage] = useState(1);
	const [redelivering, setRedelivering] = useState<string | null>(null);

	useEffect(() => {
		if (webhook) {
			setPage(1);
			setRedelivering(null);
		}
	}, [webhook]);

	const deliveries = useQuery({
		...webhookDeliveriesQuery(orgId, webhook?.id ?? "", page),
		enabled: webhook !== null,
		refetchInterval: (query) =>
			query.state.data?.items.some((item) => item.status === "pending")
				? 3000
				: false,
	});

	const redeliverMutation = useMutation({
		mutationFn: (deliveryId: string) =>
			unwrap(
				client.api.orgs[":orgId"]["webhook-deliveries"][
					":deliveryId"
				].redeliver.$post({
					param: { orgId, deliveryId },
				}),
			),
		onMutate: (deliveryId) => setRedelivering(deliveryId),
		onSettled: () => setRedelivering(null),
		onSuccess: () => {
			if (webhook) {
				queryClient.invalidateQueries({
					queryKey: webhookDeliveriesRootKey(orgId, webhook.id),
				});
			}
		},
	});

	const totalPages = deliveries.data
		? Math.max(1, Math.ceil(deliveries.data.total / deliveries.data.pageSize))
		: 1;

	return (
		<Dialog open={webhook !== null} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
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
							<TableHead>{t("webhooks.responseStatus")}</TableHead>
							<TableHead>{t("webhooks.attempts")}</TableHead>
							<TableHead>{t("webhooks.time")}</TableHead>
							<TableHead className="text-right">
								{t("common.actions")}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{deliveries.data?.items.map((delivery: WebhookDeliveryDto) => (
							<TableRow key={delivery.id}>
								<TableCell>
									<EventBadge event={delivery.event} />
								</TableCell>
								<TableCell>
									<DeliveryStatusBadge status={delivery.status} />
								</TableCell>
								<TableCell className="font-mono text-xs">
									{delivery.responseStatus ?? "—"}
								</TableCell>
								<TableCell>{delivery.attempts}</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{formatRelativeTime(
										delivery.lastAttemptAt ?? delivery.createdAt,
									)}
								</TableCell>
								<TableCell className="text-right">
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("webhooks.redeliver")}
										disabled={redelivering !== null}
										onClick={() => redeliverMutation.mutate(delivery.id)}
									>
										{redelivering === delivery.id ? (
											<Loader2 className="animate-spin" />
										) : (
											<RefreshCw />
										)}
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
								<TableCell colSpan={6} className="text-center text-red-500">
									{deliveries.error.message}
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
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription>
							{redeliverMutation.error.message}
						</AlertDescription>
					</Alert>
				)}
				<div className="flex items-center justify-end gap-2 text-sm">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1 || deliveries.isPending}
						onClick={() => setPage((p) => p - 1)}
					>
						{t("common.prev")}
					</Button>
					<span className="text-muted-foreground">
						{t("issues.pageIndicator", { page, total: totalPages })}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages || deliveries.isPending}
						onClick={() => setPage((p) => p + 1)}
					>
						{t("common.next")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
