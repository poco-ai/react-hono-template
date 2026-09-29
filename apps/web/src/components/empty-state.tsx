import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
	icon: Icon = Inbox,
	title,
	description,
	action,
}: {
	icon?: LucideIcon;
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
			<div className="bg-muted text-muted-foreground flex items-center justify-center rounded-full p-3">
				<Icon className="size-6" />
			</div>
			<div className="flex flex-col gap-1">
				<p className="text-sm font-medium">{title}</p>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{action ? (
				<div className="flex flex-wrap items-center justify-center gap-2">
					{action}
				</div>
			) : null}
		</div>
	);
}
