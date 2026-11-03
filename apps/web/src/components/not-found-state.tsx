import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { type LucideIcon, SearchX } from "lucide-react";
import type { ReactNode } from "react";

export function NotFoundState({
	title,
	description,
	action,
	icon: Icon = SearchX,
	fullscreen = false,
}: {
	title: string;
	description?: string;
	action: ReactNode;
	icon?: LucideIcon;
	fullscreen?: boolean;
}) {
	return (
		<Empty className={fullscreen ? "min-h-svh justify-center p-8" : "py-16"}>
			<EmptyHeader>
				<EmptyMedia>
					<Icon className="text-muted-foreground size-10" />
				</EmptyMedia>
				<EmptyTitle className="text-lg font-semibold">
					<h1>{title}</h1>
				</EmptyTitle>
				{description ? (
					<EmptyDescription className="max-w-md">
						{description}
					</EmptyDescription>
				) : null}
			</EmptyHeader>
			<EmptyContent>{action}</EmptyContent>
		</Empty>
	);
}
