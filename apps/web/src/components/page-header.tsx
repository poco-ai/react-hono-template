import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Shared page header for the settings pages: a single heading spec
 * (`h2 text-lg font-medium`) with an optional badge placed next to the title
 * and right-aligned actions. Every org-settings tab renders its page title
 * through this component so headers stay consistent instead of each page
 * hand-rolling its own header row. Titles stay icon-free to match the page
 * headers used elsewhere in the app.
 */
export function PageHeader({
	title,
	badge,
	actions,
	className,
}: {
	title: ReactNode;
	badge?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex items-center justify-between gap-4", className)}>
			<div className="flex min-w-0 items-center gap-2">
				<h2 className="truncate text-lg font-medium">{title}</h2>
				{badge}
			</div>
			{actions ? (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}
