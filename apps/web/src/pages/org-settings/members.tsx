import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { CircleAlert, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QuotaError } from "@/components/quota-error";
import { UserAvatar } from "@/components/user-avatar";
import { authClient } from "@/lib/auth-client";
import type { OrgInvitation, OrgMember, OrgRole } from "@/lib/queries/members";
import {
	invitationsQuery,
	MANAGE_ROLES,
	membersQuery,
	ORG_ROLES,
} from "@/lib/queries/members";
import { useSession } from "@/lib/session";

const INVITABLE_ROLES: OrgRole[] = ["admin", "member"];

export function MembersSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const members = useQuery(membersQuery(orgId));
	const invitations = useQuery(invitationsQuery(orgId));
	const [inviteOpen, setInviteOpen] = useState(false);
	const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);

	const myMember = members.data?.find((m) => m.userId === session?.user.id);
	const canManage =
		myMember !== undefined &&
		(MANAGE_ROLES as string[]).includes(myMember.role);
	const pendingInvitations = (invitations.data ?? []).filter(
		(invitation) => invitation.status === "pending",
	);

	const invalidateMembers = () => {
		queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "members"] });
		queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "invitations"] });
	};

	const roleMutation = useMutation({
		mutationFn: async ({
			memberId,
			role,
		}: {
			memberId: string;
			role: OrgRole;
		}) => {
			const { error } = await authClient.organization.updateMemberRole({
				organizationId: orgId,
				memberId,
				role,
			});
			if (error) {
				throw new Error(`[${error.code ?? "error"}] ${error.message ?? ""}`);
			}
		},
		onSuccess: invalidateMembers,
	});

	const removeMutation = useMutation({
		mutationFn: async (memberId: string) => {
			const { error } = await authClient.organization.removeMember({
				organizationId: orgId,
				memberIdOrEmail: memberId,
			});
			if (error) {
				throw new Error(`[${error.code ?? "error"}] ${error.message ?? ""}`);
			}
		},
		onSuccess: () => {
			invalidateMembers();
			setRemoveTarget(null);
		},
	});

	const revokeMutation = useMutation({
		mutationFn: async (invitationId: string) => {
			const { error } = await authClient.organization.cancelInvitation({
				invitationId,
			});
			if (error) {
				throw new Error(`[${error.code ?? "error"}] ${error.message ?? ""}`);
			}
		},
		onSuccess: invalidateMembers,
	});

	return (
		<div className="flex flex-col gap-10">
			<section className="flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-medium">{t("settings.members")}</h2>
					{canManage && (
						<Button onClick={() => setInviteOpen(true)}>
							<Plus />
							{t("members.invite")}
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
						{members.data?.map((member) => {
							const isSelf = member.userId === session?.user.id;
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
												member.role === "owner" ||
												!canManage ||
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
											<SelectTrigger className="w-28">
												<SelectValue />
											</SelectTrigger>
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
										<Button
											variant="ghost"
											size="sm"
											className="text-destructive hover:text-destructive"
											disabled={!canManage || isSelf || member.role === "owner"}
											onClick={() => setRemoveTarget(member)}
										>
											{t("common.remove")}
										</Button>
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
									{members.error.message}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
				{(roleMutation.isError || removeMutation.isError) && (
					<Alert variant="destructive">
						<CircleAlert />
						<AlertDescription>
							{(roleMutation.error ?? removeMutation.error)?.message}
						</AlertDescription>
					</Alert>
				)}
			</section>

			{canManage && (
				<section className="flex flex-col gap-4">
					<h2 className="text-lg font-medium">{t("members.pendingTitle")}</h2>
					{pendingInvitations.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{t("members.noPending")}
						</p>
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
								{pendingInvitations.map((invitation: OrgInvitation) => (
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
												disabled={revokeMutation.isPending}
												onClick={() => revokeMutation.mutate(invitation.id)}
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
								{revokeMutation.error.message}
							</AlertDescription>
						</Alert>
					)}
				</section>
			)}

			<InviteDialog
				orgId={orgId}
				open={inviteOpen}
				onOpenChange={setInviteOpen}
				onInvited={invalidateMembers}
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
		</div>
	);
}

function InviteDialog({
	orgId,
	open,
	onOpenChange,
	onInvited,
	canUpgrade,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInvited: () => void;
	canUpgrade: boolean;
}) {
	const { t } = useTranslation();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<OrgRole>("member");
	const [inviteLink, setInviteLink] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (open) {
			setEmail("");
			setRole("member");
			setInviteLink(null);
			setCopied(false);
		}
	}, [open]);

	const inviteMutation = useMutation({
		mutationFn: async (): Promise<string> => {
			const { data, error } = await authClient.organization.inviteMember({
				organizationId: orgId,
				email: email.trim(),
				role,
			});
			if (error || !data) {
				throw new Error(
					`[${error?.code ?? "error"}] ${error?.message ?? t("members.inviteFailed")}`,
				);
			}
			return `${window.location.origin}/invite?invitationId=${data.id}`;
		},
		onSuccess: (link) => {
			setInviteLink(link);
			setCopied(false);
			onInvited();
		},
	});

	const copyLink = async () => {
		if (!inviteLink) {
			return;
		}
		await navigator.clipboard.writeText(inviteLink);
		setCopied(true);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{inviteLink ? t("members.inviteLinkTitle") : t("members.invite")}
					</DialogTitle>
					<DialogDescription>
						{inviteLink
							? t("members.inviteLinkDescription", { email: email.trim() })
							: t("members.inviteDescription")}
					</DialogDescription>
				</DialogHeader>
				{inviteLink ? (
					<div className="flex flex-col gap-3">
						<div className="flex gap-2">
							<Input
								readOnly
								value={inviteLink}
								className="font-mono text-xs"
							/>
							<Button type="button" variant="outline" onClick={copyLink}>
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
							if (email.trim()) {
								inviteMutation.mutate();
							}
						}}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="invite-email">{t("common.email")}</Label>
							<Input
								id="invite-email"
								type="email"
								value={email}
								placeholder={t("common.emailPlaceholder")}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("common.role")}</Label>
							<Select
								value={role}
								onValueChange={(v) => v && setRole(v as OrgRole)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{INVITABLE_ROLES.map((r) => (
										<SelectItem key={r} value={r}>
											{t(`members.roles.${r}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{inviteMutation.isError && (
							<QuotaError
								error={inviteMutation.error}
								orgId={orgId}
								canUpgrade={canUpgrade}
							/>
						)}
						<DialogFooter>
							<Button type="submit" disabled={inviteMutation.isPending}>
								{t("members.invite")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
