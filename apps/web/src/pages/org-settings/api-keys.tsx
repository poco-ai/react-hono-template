import type { ApiKeyDto } from "@api/dto/apikey.dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createApiKeySchema } from "@workspace/shared";
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
import { Button, buttonVariants } from "@workspace/ui/components/button";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { CircleAlert, ExternalLink, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SecretReveal } from "@/components/secret-reveal";
import { TablePagination } from "@/components/table-pagination";
import { UserAvatar } from "@/components/user-avatar";
import { client, unwrap } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";
import { formatDate, formatRelativeTime } from "@/lib/issue-utils";
import { apiKeysQuery, apiKeysRootKey } from "@/lib/queries/apikeys";
import { membersQuery } from "@/lib/queries/members";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useOrgFrozen } from "@/lib/use-org-frozen";

export function ApiKeysSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.apiKeys"));
	const queryClient = useQueryClient();
	const [page, setPage] = useState(1);
	const [createOpen, setCreateOpen] = useState(false);
	const [revokeTarget, setRevokeTarget] = useState<ApiKeyDto | null>(null);

	const keys = useQuery(apiKeysQuery(orgId, page));
	const members = useQuery(membersQuery(orgId));
	const frozen = useOrgFrozen(orgId);

	const creatorOf = (createdById: string | null) => {
		if (!createdById) {
			return null;
		}
		return (
			members.data?.find((member) => member.userId === createdById)?.user ??
			null
		);
	};

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: apiKeysRootKey(orgId) });

	const revokeMutation = useMutation({
		mutationFn: (keyId: string) =>
			unwrap(
				client.api.orgs[":orgId"]["api-keys"][":keyId"].$delete({
					param: { orgId, keyId },
				}),
			),
		onSuccess: () => {
			invalidate();
			setRevokeTarget(null);
			setPage((current) => {
				const remaining = (keys.data?.total ?? 1) - 1;
				const size = keys.data?.pageSize ?? 10;
				const maxPage = Math.max(1, Math.ceil(remaining / size));
				return Math.min(current, maxPage);
			});
		},
	});

	const totalPages = keys.data
		? Math.max(1, Math.ceil(keys.data.total / keys.data.pageSize))
		: 1;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-medium">{t("settings.apiKeys")}</h2>
				<div className="flex items-center gap-2">
					<Link
						to="/api-docs"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<ExternalLink />
						{t("apiKeys.viewDocs")}
					</Link>
					<Button onClick={() => setCreateOpen(true)} disabled={frozen}>
						<Plus />
						{t("apiKeys.create")}
					</Button>
				</div>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("apiKeys.name")}</TableHead>
						<TableHead className="w-40">{t("apiKeys.key")}</TableHead>
						<TableHead className="w-24">{t("members.status")}</TableHead>
						<TableHead className="w-24 text-right">
							{t("common.actions")}
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{keys.data?.items.map((apiKey) => {
						const revoked = apiKey.revokedAt !== null;
						const creator = creatorOf(apiKey.createdById);
						return (
							<TableRow key={apiKey.id}>
								<TableCell>
									<div className="flex items-center gap-3">
										{creator && (
											<UserAvatar name={creator.name} className="size-8" />
										)}
										<div className="min-w-0">
											<div className="truncate font-medium">{apiKey.name}</div>
											<div className="text-muted-foreground truncate text-xs">
												{creator ? creator.name : t("apiKeys.unknownCreator")}
												{" · "}
												{t("apiKeys.created")} {formatDate(apiKey.createdAt)}
												{" · "}
												{apiKey.lastUsedAt
													? `${t("apiKeys.lastUsed")} ${formatRelativeTime(apiKey.lastUsedAt)}`
													: t("apiKeys.lastUsedNever")}
											</div>
										</div>
									</div>
								</TableCell>
								<TableCell className="font-mono text-xs">
									{apiKey.prefix}…
								</TableCell>
								<TableCell>
									{revoked ? (
										<Badge variant="destructive">
											{t("apiKeys.statusRevoked")}
										</Badge>
									) : (
										<Badge variant="outline">{t("apiKeys.statusActive")}</Badge>
									)}
								</TableCell>
								<TableCell className="text-right">
									{revoked ? (
										<span className="text-muted-foreground">—</span>
									) : (
										<Button
											variant="ghost"
											size="sm"
											className="text-destructive hover:text-destructive"
											disabled={frozen || revokeMutation.isPending}
											onClick={() => setRevokeTarget(apiKey)}
										>
											{t("apiKeys.revoke")}
										</Button>
									)}
								</TableCell>
							</TableRow>
						);
					})}
					{keys.isPending && (
						<TableRow>
							<TableCell
								colSpan={4}
								className="text-muted-foreground h-16 text-center"
							>
								{t("common.loading")}
							</TableCell>
						</TableRow>
					)}
					{keys.isError && (
						<TableRow>
							<TableCell colSpan={4} className="text-center text-red-500">
								{apiErrorMessage(t, keys.error)}
							</TableCell>
						</TableRow>
					)}
					{!keys.isPending && keys.data?.items.length === 0 && (
						<TableRow>
							<TableCell
								colSpan={4}
								className="text-muted-foreground h-16 text-center"
							>
								{t("apiKeys.empty")}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			<div className="text-muted-foreground flex items-center justify-between text-sm">
				<span>
					{keys.data ? t("apiKeys.keyCount", { count: keys.data.total }) : ""}
				</span>
				<TablePagination
					page={page}
					total={keys.data?.total}
					totalPages={totalPages}
					onPageChange={setPage}
					disabled={keys.isPending}
				/>
			</div>

			{revokeMutation.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, revokeMutation.error)}
					</AlertDescription>
				</Alert>
			)}

			<CreateApiKeyDialog
				orgId={orgId}
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={invalidate}
			/>

			<AlertDialog
				open={revokeTarget !== null}
				onOpenChange={(open) => !open && setRevokeTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("apiKeys.revokeTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("apiKeys.revokeDescription", {
								name: revokeTarget?.name ?? "",
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={revokeMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								if (revokeTarget) {
									revokeMutation.mutate(revokeTarget.id);
								}
							}}
						>
							{t("apiKeys.revoke")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function CreateApiKeyDialog({
	orgId,
	open,
	onOpenChange,
	onCreated,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	useEffect(() => {
		if (open) {
			setName("");
			setCreatedKey(null);
			setFieldErrors({});
		}
	}, [open]);

	const createMutation = useMutation({
		mutationFn: async (input: { name: string }) =>
			unwrap(
				client.api.orgs[":orgId"]["api-keys"].$post({
					param: { orgId },
					json: input,
				}),
			),
		onSuccess: (apiKey) => {
			setCreatedKey(apiKey.key);
			onCreated();
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{createdKey ? t("apiKeys.createdTitle") : t("apiKeys.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{createdKey
							? t("apiKeys.secretWarning")
							: t("apiKeys.createDescription")}
					</DialogDescription>
				</DialogHeader>
				{createdKey ? (
					<div className="flex flex-col gap-3">
						<SecretReveal value={createdKey} />
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
							const parsed = createApiKeySchema.safeParse({
								name: name.trim(),
							});
							if (!parsed.success) {
								const errors = fieldErrorsFromZod(parsed.error, t);
								setFieldErrors(errors);
								focusFirstInvalidField(errors, { name: "api-key-name" });
								return;
							}
							createMutation.mutate(parsed.data);
						}}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="api-key-name">{t("apiKeys.name")}</Label>
							<Input
								id="api-key-name"
								value={name}
								placeholder={t("apiKeys.namePlaceholder")}
								onChange={(e) => {
									setName(e.target.value);
									setFieldErrors((prev) => withoutFieldError(prev, "name"));
								}}
								maxLength={50}
								aria-invalid={fieldErrors.name ? true : undefined}
								aria-describedby={
									fieldErrors.name ? "api-key-name-error" : undefined
								}
							/>
							{fieldErrors.name && (
								<p id="api-key-name-error" className="text-destructive text-sm">
									{fieldErrors.name}
								</p>
							)}
						</div>
						{createMutation.isError && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>
									{apiErrorMessage(t, createMutation.error)}
								</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button type="submit" disabled={createMutation.isPending}>
								{t("common.create")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
