import { SearchX } from "lucide-react";
import type { ReactNode } from "react";

export function NotFoundState({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action: ReactNode;
}) {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
			<SearchX className="text-muted-foreground size-10" />
			<h1 className="text-lg font-semibold">{title}</h1>
			{description ? (
				<p className="text-muted-foreground max-w-md text-sm">{description}</p>
			) : null}
			{action}
		</div>
	);
}
