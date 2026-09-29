import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { apiErrorMessage, errorCode } from "@/lib/errors";
import { membersQuery } from "@/lib/queries/members";
import { orgsQuery } from "@/lib/queries/org";
import { useSession } from "@/lib/session";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useOrgFrozen } from "@/lib/use-org-frozen";

export function GeneralSettingsPage({
	orgId,
	denied,
}: {
	orgId: string;
	denied?: boolean;
}) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.general"));
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const orgs = useQuery(orgsQuery());
	const members = useQuery(membersQuery(orgId));
	const frozen = useOrgFrozen(orgId);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [saved, setSaved] = useState(false);
	const [leaveOpen, setLeaveOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState("");

	const org = orgs.data?.find((o) => o.id === orgId);
	const orgName = org?.name;
	const orgSlug = org?.slug;

	useEffect(() => {
		if (orgName !== undefined && orgSlug !== undefined) {
			setName(orgName);
			setSlug(orgSlug);
		}
	}, [orgName, orgSlug]);

	const myMember = members.data?.find((m) => m.userId === session?.user.id);
	const isOwner = myMember?.role === "owner";
	const canManage = isOwner || myMember?.role === "admin";
	const soleOwner =
		isOwner &&
		(members.data ?? []).filter((m) => m.role === "owner").length === 1;

	const updateMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.organization.update({
				organizationId: orgId,
				data: { name: name.trim(), slug },
			});
			if (error) {
				throw Object.assign(
					new Error(error.message ?? t("settings.updateFailed")),
					{ code: errorCode(error) },
				);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orgsQuery().queryKey });
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		},
	});

	const leaveMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.organization.leave({
				organizationId: orgId,
			});
			if (error) {
				throw Object.assign(new Error(error.message ?? ""), {
					code: errorCode(error),
				});
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orgs"] });
			navigate({ to: "/", replace: true });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.organization.delete({
				organizationId: orgId,
			});
			if (error) {
				throw Object.assign(new Error(error.message ?? ""), {
					code: errorCode(error),
				});
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orgs"] });
			navigate({ to: "/", replace: true });
		},
	});

	if (!org) {
		return (
			<div className="px-4 py-8 lg:px-6">
				<p className="text-muted-foreground text-sm">
					{orgs.isPending ? t("common.loading") : t("common.failedToLoad")}
				</p>
			</div>
		);
	}

	const dirty = canManage && (name.trim() !== org.name || slug !== org.slug);

	return (
		<div className="flex flex-col gap-10">
			{denied && (
				<Alert>
					<CircleAlert />
					<AlertDescription>{t("settings.noPermission")}</AlertDescription>
				</Alert>
			)}
			<section className="flex flex-col gap-4">
				<h2 className="text-lg font-medium">{t("settings.general")}</h2>
				<div className="max-w-md">
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="org-name">{t("settings.orgName")}</Label>
							<Input
								id="org-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								disabled={!canManage || frozen}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="org-slug">{t("settings.slug")}</Label>
							<Input
								id="org-slug"
								value={slug}
								onChange={(e) => setSlug(e.target.value)}
								className="font-mono text-sm"
								disabled={!canManage || frozen}
							/>
						</div>
						{canManage ? (
							<div className="flex items-center gap-3">
								<Button
									onClick={() => updateMutation.mutate()}
									disabled={
										frozen || !dirty || !name.trim() || updateMutation.isPending
									}
								>
									{t("settings.save")}
								</Button>
								{saved && (
									<span className="text-muted-foreground text-sm">
										{t("settings.saved")}
									</span>
								)}
							</div>
						) : (
							<p className="text-muted-foreground text-xs">
								{t("errors.orgSettingsRequired")}
							</p>
						)}
						{updateMutation.isError && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>
									{apiErrorMessage(
										t,
										updateMutation.error,
										"settings.updateFailed",
									)}
								</AlertDescription>
							</Alert>
						)}
					</div>
				</div>
			</section>

			<section className="border-destructive/30 flex flex-col gap-4 rounded-xl border p-4">
				<h2 className="text-destructive text-lg font-medium">
					{t("settings.dangerZone")}
				</h2>

				<div className="flex items-center justify-between gap-4">
					<div>
						<p className="text-sm font-medium">{t("settings.leaveTitle")}</p>
						<p className="text-muted-foreground text-sm">
							{t("settings.leaveDescription")}
						</p>
					</div>
					{soleOwner ? (
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										variant="outline"
										disabled
										onClick={() => setLeaveOpen(true)}
									>
										{t("settings.leaveButton")}
									</Button>
								}
							/>
							<TooltipContent>{t("settings.soleOwnerHint")}</TooltipContent>
						</Tooltip>
					) : (
						<Button
							variant="outline"
							disabled={frozen}
							onClick={() => setLeaveOpen(true)}
						>
							{t("settings.leaveButton")}
						</Button>
					)}
				</div>

				{isOwner && (
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium">{t("settings.deleteTitle")}</p>
							<p className="text-muted-foreground text-sm">
								{t("settings.deleteDescription")}
							</p>
						</div>
						<Button
							variant="destructive"
							disabled={frozen}
							onClick={() => setDeleteOpen(true)}
						>
							{t("settings.deleteButton")}
						</Button>
					</div>
				)}
			</section>

			<AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("settings.leaveConfirmTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("settings.leaveConfirmDescription", { name: org.name })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							disabled={leaveMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								leaveMutation.mutate();
							}}
						>
							{t("settings.leaveButton")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog
				open={deleteOpen}
				onOpenChange={(open) => {
					setDeleteOpen(open);
					if (!open) {
						setDeleteConfirm("");
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("settings.deleteDialogTitle")}</DialogTitle>
						<DialogDescription>
							{t("settings.deleteDialogDescription", { name: org.name })}
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Input
							value={deleteConfirm}
							placeholder={org.name}
							onChange={(e) => setDeleteConfirm(e.target.value)}
						/>
						{deleteMutation.isError && (
							<Alert variant="destructive">
								<CircleAlert />
								<AlertDescription>
									{apiErrorMessage(t, deleteMutation.error)}
								</AlertDescription>
							</Alert>
						)}
					</div>
					<DialogFooter>
						<Button
							variant="destructive"
							disabled={deleteConfirm !== org.name || deleteMutation.isPending}
							onClick={() => deleteMutation.mutate()}
						>
							{t("settings.deleteButton")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
