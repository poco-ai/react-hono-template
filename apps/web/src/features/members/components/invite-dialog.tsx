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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { QuotaError } from "@/components/quota-error";
import { SecretReveal } from "@/components/secret-reveal";
import { type OrgRole, useInviteMember } from "@/features/members/data";

import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
	withoutFieldError,
} from "@/lib/form";

const INVITABLE_ROLES: OrgRole[] = ["admin", "member"];

const inviteSchema = z.object({
	email: z.string().trim().min(1).email(),
});

export function InviteDialog({
	orgId,
	open,
	onOpenChange,
	canUpgrade,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	canUpgrade: boolean;
}) {
	const { t } = useTranslation();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<OrgRole>("member");
	const [inviteLink, setInviteLink] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

	useEffect(() => {
		if (open) {
			setEmail("");
			setRole("member");
			setInviteLink(null);
			setFieldErrors({});
		}
	}, [open]);

	const inviteMutation = useInviteMember(orgId, {
		onSuccess: (link) => {
			setInviteLink(`${window.location.origin}/invite?invitationId=${link}`);
		},
	});

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
						<SecretReveal value={inviteLink} />
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
							const parsed = inviteSchema.safeParse({ email });
							if (!parsed.success) {
								const errors = fieldErrorsFromZod(parsed.error, t);
								setFieldErrors(errors);
								focusFirstInvalidField(errors, { email: "invite-email" });
								return;
							}
							inviteMutation.mutate({ email: email.trim(), role });
						}}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor="invite-email">{t("common.email")}</Label>
							<Input
								id="invite-email"
								type="email"
								value={email}
								placeholder={t("common.emailPlaceholder")}
								onChange={(e) => {
									setEmail(e.target.value);
									setFieldErrors((prev) => withoutFieldError(prev, "email"));
								}}
								aria-invalid={fieldErrors.email ? true : undefined}
								aria-describedby={
									fieldErrors.email ? "invite-email-error" : undefined
								}
							/>
							{fieldErrors.email && (
								<p id="invite-email-error" className="text-destructive text-sm">
									{fieldErrors.email}
								</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Label>{t("common.role")}</Label>
							<Select
								value={role}
								onValueChange={(v) => v && setRole(v as OrgRole)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>{t(`members.roles.${role}`)}</SelectValue>
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
