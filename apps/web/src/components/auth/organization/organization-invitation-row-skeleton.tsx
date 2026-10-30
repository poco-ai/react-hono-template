"use client";

import { Skeleton } from "@workspace/ui/components/skeleton";
import { TableCell, TableRow } from "@workspace/ui/components/table";

/**
 * Placeholder row matching `OrganizationInvitationRow` while invitations load.
 */
export function OrganizationInvitationRowSkeleton() {
	return (
		<TableRow>
			<TableCell>
				<Skeleton className="h-4 w-48 rounded-md" />
			</TableCell>

			<TableCell>
				<Skeleton className="h-4 w-36 rounded-md" />
			</TableCell>

			<TableCell>
				<Skeleton className="h-4 w-16 rounded-md" />
			</TableCell>

			<TableCell>
				<Skeleton className="h-4 w-14 rounded-full" />
			</TableCell>

			<TableCell />
		</TableRow>
	);
}
