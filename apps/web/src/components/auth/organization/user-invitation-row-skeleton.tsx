import { Item, ItemContent, ItemMedia } from "@workspace/ui/components/item";
import { Skeleton } from "@workspace/ui/components/skeleton";

/**
 * Placeholder row matching `UserInvitationRow` while invitations load.
 */
export function UserInvitationRowSkeleton() {
	return (
		<Item>
			<ItemMedia>
				<Skeleton className="size-10 shrink-0 rounded-md" />
			</ItemMedia>
			<ItemContent>
				<Skeleton className="h-4 w-40 rounded-md" />
				<Skeleton className="h-3 w-28 rounded-md" />
			</ItemContent>
		</Item>
	);
}
