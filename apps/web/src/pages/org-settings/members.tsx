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
import { Input } from "@workspace/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { CircleAlert, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { useSession } from "@/features/auth/data";
import { InviteDialog } from "@/features/members/components/invite-dialog";
import {
	invitationsQuery,
	MANAGE_ROLES,
	membersQuery,
	ORG_ROLES,
	type OrgInvitation,
	type OrgMember,
	type OrgRole,
	useRemoveMember,
	useRevokeInvitation,
	useUpdateMemberRole,
} from "@/features/members/data";
import { apiErrorMessage } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useOrgFrozen } from "@/lib/use-org-frozen";

export function MembersSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.members"));

	const { data: session } = useSession();
	const members = useQuery(membersQuery(orgId));
	const invitations = useQuery(invitationsQuery(orgId));
	const frozen = useOrgFrozen(orgId);
	const [inviteOpen, setInviteOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
	const [revokeTarget, setRevokeTarget] = useState<OrgInvitation | null>(null);

	const myMember = members.data?.find((m) => m.userId === session?.user.id);
	const canManage =
		myMember !== undefined &&
		(MANAGE_ROLES as string[]).includes(myMember.role);
	const ownerCount = (members.data ?? []).filter(
		(m) => m.role === "owner",
	).length;
	const pendingInvitations = (invitations.data ?? []).filter(
		(invitation) => invitation.status === "pending",
	);
	const query = search.trim().toLowerCase();
	const filteredMembers = query
		? (members.data ?? []).filter(
				(member) =>
					member.user.name.toLowerCase().includes(query) ||
					member.user.email.toLowerCase().includes(query),
			)
		: (members.data ?? []);
	const filteredInvitations = query
		? pendingInvitations.filter((invitation) =>
				invitation.email.toLowerCase().includes(query),
			)
		: pendingInvitations;

	const clearSearch = () => setSearch("");

	const roleMutation = useUpdateMemberRole(orgId, {
		onSuccess: () => {
			toast.success(t("toast.memberRoleUpdated"));
		},
	});

	const removeMutation = useRemoveMember(orgId, {
		onSuccess: () => {
			toast.success(t("toast.memberRemoved"));

			setRemoveTarget(null);
		},
	});

	const revokeMutation = useRevokeInvitation(orgId, {
		onSuccess: () => {
			toast.success(t("toast.invitationRevoked"));

			setRevokeTarget(null);
		},
	});

	return (
		<div className="flex flex-col gap-10">
			<section className="flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-medium">{t("settings.members")}</h2>
					{canManage && (
						<Button onClick={() => setInviteOpen(true)} disabled={frozen}>
							<Plus />
							{t("members.invite")}
						</Button>
					)}
				</div>
				<div className="relative max-w-xs">
					<Input
						placeholder={t("members.searchPlaceholder")}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								clearSearch();
							}
						}}
						className="pr-8"
					/>
					{search && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="absolute top-1/2 right-1 size-6 -translate-y-1/2"
							aria-label={t("common.clear")}
							onClick={clearSearch}
						>
							<X />
						</Button>
					)}
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("members.member")}</TableHead>
							<TableHead className="w-36">{t("common.role")}</TableHead>
							<TableHead className="w-24 text-right">
								{t("common.actions")}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredMembers.map((member) => {
							const isSelf = member.userId === session?.user.id;
							const isLastOwner = member.role === "owner" && ownerCount <= 1;
							return (
								<TableRow key={member.id}>
									<TableCell>
										<div className="flex items-center gap-3">
											<UserAvatar name={member.user.name} className="size-8" />
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<span className="truncate font-medium">
														{member.user.name}
													</span>
													{isSelf && (
														<span className="text-muted-foreground text-xs">
															{t("common.you")}
														</span>
													)}
												</div>
												<div className="text-muted-foreground truncate text-xs">
													{member.user.email}
												</div>
											</div>
										</div>
									</TableCell>
									<TableCell>
										<Select
											value={member.role}
											disabled={
												frozen ||
												!canManage ||
												isSelf ||
												isLastOwner ||
												roleMutation.isPending
											}
											onValueChange={(v) =>
												v &&
												roleMutation.mutate({
													memberId: member.id,
													role: v as OrgRole,
												})
											}
										>
											<span
												className="inline-block"
												title={
													isSelf
														? t("members.selfRoleTooltip")
														: isLastOwner
															? t("members.lastOwnerTooltip")
															: undefined
												}
											>
												<SelectTrigger className="w-28">
													<SelectValue>
														{t(`members.roles.${member.role as OrgRole}`)}
													</SelectValue>
												</SelectTrigger>
											</span>
											<SelectContent>
												{ORG_ROLES.map((role) => (
													<SelectItem key={role} value={role}>
														{t(`members.roles.${role}`)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell className="text-right">
										<span
											className="inline-block"
											title={
												isSelf ? t("members.selfRemoveTooltip") : undefined
											}
										>
											<Button
												variant="ghost"
												size="sm"
												className="text-destructive hover:text-destructive"
												disabled={
													frozen ||
													!canManage ||
													isSelf ||
													member.role === "owner"
												}
												onClick={() => setRemoveTarget(member)}
											>
												{t("common.remove")}
											</Button>
										</span>
									</TableCell>
								</TableRow>
							);
						})}
						{members.isPending && (
							<TableRow>
								<TableCell
									colSpan={3}
									className="text-muted-foreground h-16 text-center"
								>
									{t("common.loading")}
								</TableCell>
							</TableRow>
						)}
						{members.isError && (
							<TableRow>
								<TableCell colSpan={3} className="text-center text-red-500">
									{apiErrorMessage(t, members.error)}
								</TableCell>
							</TableRow>
						)}
						{!members.isPending &&
							!members.isError &&
							filteredMembers.length === 0 && (
								<TableRow>
									<TableCell colSpan={3} className="p-0">
										<EmptyState title={t("members.noResults")} />
									</TableCell>
								</TableRow>
							)}
					</TableBody>
				</Table>
				{(roleMutation.isError || removeMutation.isError) && (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription>
							{apiErrorMessage(t, roleMutation.error ?? removeMutation.error)}
						</AlertDescription>
					</Alert>
				)}
			</section>

			{canManage && (
				<section className="flex flex-col gap-4">
					<h2 className="text-lg font-medium">{t("members.pendingTitle")}</h2>
					{filteredInvitations.length === 0 ? (
						pendingInvitations.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{t("members.noPending")}
							</p>
						) : (
							<EmptyState title={t("members.noResults")} />
						)
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("common.email")}</TableHead>
									<TableHead className="w-28">{t("common.role")}</TableHead>
									<TableHead className="w-28">{t("members.status")}</TableHead>
									<TableHead className="w-24 text-right">
										{t("common.actions")}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredInvitations.map((invitation: OrgInvitation) => (
									<TableRow key={invitation.id}>
										<TableCell>{invitation.email}</TableCell>
										<TableCell>
											{t(`members.roles.${invitation.role as OrgRole}`)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{t("members.statusPending")}
										</TableCell>
										<TableCell className="text-right">
											<Button
												variant="ghost"
												size="sm"
												className="text-destructive hover:text-destructive"
												disabled={frozen || revokeMutation.isPending}
												onClick={() => setRevokeTarget(invitation)}
											>
												{t("members.revoke")}
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
					{revokeMutation.isError && (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertDescription>
								{apiErrorMessage(t, revokeMutation.error)}
							</AlertDescription>
						</Alert>
					)}
				</section>
			)}

			<InviteDialog
				orgId={orgId}
				open={inviteOpen}
				onOpenChange={setInviteOpen}
				canUpgrade={canManage}
			/>

			<AlertDialog
				open={removeTarget !== null}
				onOpenChange={(open) => !open && setRemoveTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("members.removeTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("members.removeDescription", {
								name: removeTarget?.user.name ?? "",
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={removeMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								if (removeTarget) {
									removeMutation.mutate(removeTarget.id);
								}
							}}
						>
							{t("common.remove")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={revokeTarget !== null}
				onOpenChange={(open) => !open && setRevokeTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("members.revokeTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("members.revokeDescription")}
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
							{t("members.revoke")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
