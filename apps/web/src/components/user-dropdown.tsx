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
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { Languages, LogOut, Shield, SunMoon, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LanguageMenuItems } from "@/components/language-switcher";
import { ThemeMenuItems } from "@/components/theme-toggle";
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

	const platformRoleLabel: Record<"admin" | "user", string> = {
		admin: t("adminUsers.roles.admin"),
		user: t("adminUsers.roles.user"),
	};

	const signOut = () => logout.mutate();

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							className={cn("h-9 min-w-0 gap-2 px-2", className)}
						>
							<Avatar className="size-6 shrink-0">
								<AvatarFallback className="text-xs">
									{user.name.slice(0, 1).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<span className="min-w-0 flex-1 truncate text-left text-sm">
								{user.name}
							</span>
							{orgRole ? (
								<Badge variant="secondary" className="shrink-0">
									{t(`org.roles.${orgRole}`)}
								</Badge>
							) : (
								user.role === "admin" && (
									<Badge variant="secondary" className="shrink-0">
										{platformRoleLabel[user.role as "admin" | "user"]}
									</Badge>
								)
							)}
						</Button>
					}
				/>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuGroup>
						<DropdownMenuLabel className="flex flex-col">
							<span>{user.name}</span>
							<span className="text-muted-foreground font-normal">
								{user.email}
							</span>
						</DropdownMenuLabel>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={() => navigate({ to: "/account" })}>
							<User />
							{t("nav.account")}
						</DropdownMenuItem>
						{user.role === "admin" && (
							<DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
								<Shield />
								{t("nav.admin")}
							</DropdownMenuItem>
						)}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<Languages />
							{t("language.toggle")}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<LanguageMenuItems />
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<SunMoon />
							{t("theme.toggle")}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<ThemeMenuItems />
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						disabled={logout.isPending}
						onClick={() => setSignOutOpen(true)}
					>
						<LogOut />
						{t("nav.signOut")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
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
								signOut();
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
