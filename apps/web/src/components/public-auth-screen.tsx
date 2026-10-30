import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useDocumentTitle } from "@/lib/use-document-title";

export function PublicAuthScreen({
	title,
	notice,
	children,
}: {
	title: string;
	notice?: ReactNode;
	children: ReactNode;
}) {
	useDocumentTitle(title);

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<div className="absolute top-4 right-4 flex items-center gap-1">
				<LanguageSwitcher />
				<ThemeToggle />
			</div>
			<div className="flex w-full max-w-sm flex-col items-center gap-4">
				<Logo />
				{notice}
				<div className="w-full">{children}</div>
			</div>
		</div>
	);
}
