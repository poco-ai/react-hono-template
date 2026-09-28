import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import type { OrgRole } from "@/lib/queries/members";
import { type SessionUser, sessionOptions } from "@/lib/session";

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
	const queryClient = useQueryClient();

	const signOut = async () => {
		await authClient.signOut();
		queryClient.setQueryData(sessionOptions.queryKey, null);
		queryClient.clear();
		navigate({ to: "/login", replace: true });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						className={cn("h-9 min-w-0 gap-2 px-2", className)}
					>
						<Avatar className="size-6">
							<AvatarFallback className="text-xs">
								{user.name.slice(0, 1).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<span className="min-w-0 truncate text-sm">{user.name}</span>
						{orgRole ? (
							<Badge variant="secondary">{t(`org.roles.${orgRole}`)}</Badge>
						) : (
							user.role === "admin" && <Badge variant="secondary">admin</Badge>
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
				<DropdownMenuItem onClick={signOut}>
					{t("nav.signOut")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
