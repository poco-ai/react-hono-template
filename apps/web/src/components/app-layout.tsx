import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserDropdown } from "@/components/user-dropdown";
import { useSession } from "@/features/auth/data";

export function AppLayout({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const { data: session } = useSession();
	const user = session?.user;

	return (
		<div className="bg-background min-h-svh">
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:border focus:bg-background focus:p-3 focus:shadow-md"
			>
				{t("common.skipToContent")}
			</a>
			<header className="border-b">
				<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
					<nav className="flex min-w-0 items-center gap-4 overflow-x-auto text-sm lg:gap-6">
						<Link to="/" className="font-medium shrink-0 whitespace-nowrap">
							React Hono Template
						</Link>
						<Link
							to="/"
							className="text-muted-foreground hover:text-foreground shrink-0 whitespace-nowrap"
						>
							{t("nav.backToApp")}
						</Link>
						{user?.role === "admin" && (
							<Link
								to="/admin/users"
								className="text-muted-foreground hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium shrink-0 whitespace-nowrap"
								activeProps={{ "aria-current": "page" }}
							>
								{t("nav.users")}
							</Link>
						)}
						{user?.role === "admin" && (
							<Link
								to="/admin/orgs"
								className="text-muted-foreground hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium shrink-0 whitespace-nowrap"
								activeProps={{ "aria-current": "page" }}
							>
								{t("nav.orgs")}
							</Link>
						)}
					</nav>
					<div className="flex shrink-0 items-center gap-1">
						<LanguageSwitcher />
						<ThemeToggle />
						{user && <UserDropdown user={user} />}
					</div>
				</div>
			</header>
			<main
				id="main-content"
				className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-6"
			>
				{children}
			</main>
		</div>
	);
}
