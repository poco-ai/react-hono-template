import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
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
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { sessionOptions, useSession } from "@/lib/session";

export function AppLayout({ children }: { children: ReactNode }) {
	const { data: session } = useSession();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const user = session?.user;

	const signOut = async () => {
		await authClient.signOut();
		queryClient.setQueryData(sessionOptions.queryKey, null);
		navigate({ to: "/login", replace: true });
	};

	return (
		<div className="min-h-svh bg-background">
			<header className="border-b">
				<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
					<nav className="flex items-center gap-6 text-sm">
						<Link to="/" className="font-medium">
							React Hono Template
						</Link>
						<Link
							to="/"
							className="text-muted-foreground hover:text-foreground"
						>
							Home
						</Link>
						{user?.role === "admin" && (
							<Link
								to="/admin/users"
								className="text-muted-foreground hover:text-foreground"
							>
								Users
							</Link>
						)}
					</nav>
					{user && (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button variant="ghost" className="h-9 gap-2 px-2">
										<Avatar className="size-6">
											<AvatarFallback className="text-xs">
												{user.name.slice(0, 1).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<span className="text-sm">{user.name}</span>
										{user.role === "admin" && (
											<Badge variant="secondary">admin</Badge>
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
								<DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</header>
			<main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
		</div>
	);
}
