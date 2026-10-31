import { useNavigate } from "@tanstack/react-router";
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
import {
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { Languages, Shield, User } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	UserButton,
	type UserButtonLink,
} from "@/components/auth/user/user-button";
import { LanguageMenuItems } from "@/components/language-switcher";
import { type SessionUser, useSignOut } from "@/features/auth/data";
import type { OrgRole } from "@/features/members/data";
import { apiErrorMessage } from "@/lib/errors";

export function UserDropdown({
	user,
	orgRole,
	className,
}: {
	user: SessionUser;
	orgRole?: OrgRole;
	className?: string;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [signOutOpen, setSignOutOpen] = useState(false);
	const logout = useSignOut({
		onSuccess: () => navigate({ to: "/login", replace: true }),
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});

	const accountLink: UserButtonLink = {
		href: "/account",
		icon: <User className="text-muted-foreground" />,
		label: t("nav.account"),
		visibility: "authenticated",
	};
	const adminLink: UserButtonLink = {
		href: "/admin",
		icon: <Shield className="text-muted-foreground" />,
		label: t("nav.admin"),
		visibility: "authenticated",
	};
	const links: (UserButtonLink | ReactElement)[] = [
		accountLink,
		...(user.role === "admin" ? [adminLink] : []),
		<DropdownMenuSeparator key="user-menu-preferences" />,
		<DropdownMenuSub key="language">
			<DropdownMenuSubTrigger>
				<Languages />
				{t("language.toggle")}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				<LanguageMenuItems />
			</DropdownMenuSubContent>
		</DropdownMenuSub>,
	];

	let badge: ReactNode = null;
	if (orgRole) {
		badge = (
			<Badge variant="secondary" className="shrink-0">
				{t(`org.roles.${orgRole}`)}
			</Badge>
		);
	} else if (user.role === "admin") {
		badge = (
			<Badge variant="secondary" className="shrink-0">
				{t("adminUsers.roles.admin")}
			</Badge>
		);
	}

	return (
		<>
			<UserButton
				align="end"
				className={cn("min-w-0", className)}
				extra={badge}
				hideSettings
				links={links}
				onSignOut={() => setSignOutOpen(true)}
				user={user}
			/>
			<AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("nav.signOutTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("nav.signOutDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={logout.isPending}
							onClick={(e) => {
								e.preventDefault();
								logout.mutate();
							}}
						>
							{t("nav.signOut")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
