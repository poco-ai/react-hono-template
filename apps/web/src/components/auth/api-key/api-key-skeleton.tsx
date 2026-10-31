// Adapted from Better Auth UI base-nova registry: https://better-auth-ui.com/r/base-nova/api-key.json
"use client";

import { Item, ItemContent, ItemMedia } from "@workspace/ui/components/item";
import { Skeleton } from "@workspace/ui/components/skeleton";

export function ApiKeySkeleton() {
	return (
		<Item>
			<ItemMedia>
				<Skeleton className="size-10 rounded-md" />
			</ItemMedia>
			<ItemContent>
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-3 w-36" />
				<Skeleton className="h-3 w-32" />
			</ItemContent>
		</Item>
	);
}
