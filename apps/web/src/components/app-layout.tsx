import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDropdown } from "@/components/user-dropdown";
import { useSession } from "@/lib/session";

export function AppLayout({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const { data: session } = useSession();
	const user = session?.user;

	return (
		<div className="bg-background min-h-svh">
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
							{t("nav.home")}
						</Link>
						{user?.role === "admin" && (
							<Link
								to="/admin/users"
								className="text-muted-foreground hover:text-foreground"
							>
								{t("nav.users")}
							</Link>
						)}
						{user?.role === "admin" && (
							<Link
								to="/admin/orgs"
								className="text-muted-foreground hover:text-foreground"
							>
								{t("nav.orgs")}
							</Link>
						)}
					</nav>
					<div className="flex items-center gap-1">
						<LanguageSwitcher />
						<ThemeToggle />
						{user && <UserDropdown user={user} />}
					</div>
				</div>
			</header>
			<main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
		</div>
	);
}
