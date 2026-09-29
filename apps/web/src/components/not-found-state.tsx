import { type LucideIcon, SearchX } from "lucide-react";
import type { ReactNode } from "react";

export function NotFoundState({
	title,
	description,
	action,
	icon: Icon = SearchX,
}: {
	title: string;
	description?: string;
	action: ReactNode;
	icon?: LucideIcon;
}) {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
			<Icon className="text-muted-foreground size-10" />
			<h1 className="text-lg font-semibold">{title}</h1>
			{description ? (
				<p className="text-muted-foreground max-w-md text-sm">{description}</p>
			) : null}
			{action}
		</div>
	);
}
