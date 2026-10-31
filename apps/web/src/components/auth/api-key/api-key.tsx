// Adapted from Better Auth UI base-nova registry; uses organization key DTOs.
import type { ApiKeyDto } from "@api/dto/api-key.dto";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@workspace/ui/components/item";
import { Key, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { DeleteApiKeyDialog } from "./delete-api-key-dialog";

export function ApiKey({
	apiKey,
	organizationId,
	creator,
	locked,
}: {
	apiKey: ApiKeyDto;
	organizationId: string;
	creator?: string;
	locked: boolean;
}) {
	const { t } = useTranslation();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const revoked = apiKey.revokedAt !== null;
	return (
		<Item>
			<ItemMedia variant="icon">
				<Key />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>
					{apiKey.name}
					<Badge variant={revoked ? "destructive" : "outline"}>
						{t(revoked ? "apiKeys.statusRevoked" : "apiKeys.statusActive")}
					</Badge>
				</ItemTitle>
				<ItemDescription className="font-mono">
					{apiKey.prefix}
					{"*".repeat(16)}
				</ItemDescription>
				<ItemDescription>
					{creator ?? t("apiKeys.unknownCreator")}
					{" · "}
					{t("apiKeys.created")} {formatDate(apiKey.createdAt)}
				</ItemDescription>
				<ItemDescription>
					{apiKey.lastUsedAt
						? `${t("apiKeys.lastUsed")} ${formatRelativeTime(apiKey.lastUsedAt)}`
						: t("apiKeys.lastUsedNever")}
				</ItemDescription>
			</ItemContent>
			<ItemActions>
				{!revoked && (
					<>
						<Button
							variant="outline"
							size="sm"
							disabled={locked}
							onClick={() => setDeleteOpen(true)}
						>
							<X />
							{t("apiKeys.revoke")}
						</Button>
						<DeleteApiKeyDialog
							open={deleteOpen}
							onOpenChange={setDeleteOpen}
							apiKey={apiKey}
							organizationId={organizationId}
							locked={locked}
						/>
					</>
				)}
			</ItemActions>
		</Item>
	);
}
