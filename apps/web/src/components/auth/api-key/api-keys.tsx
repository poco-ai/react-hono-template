// Adapted from Better Auth UI base-nova registry. Query/mutation policy stays in
// features/api-keys/data.ts to preserve existing keys, revocation history and auth.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { ItemGroup, ItemSeparator } from "@workspace/ui/components/item";
import { ExternalLink } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { apiKeysQuery } from "@/features/api-keys/data";
import { membersQuery } from "@/features/members/data";
import { useOrgFrozen } from "@/features/organizations/use-org-frozen";
import { useOrgRole } from "@/features/organizations/use-org-role";
import { apiErrorMessage } from "@/lib/errors";
import { pageCount } from "@/lib/pagination";
import { ApiKey } from "./api-key";
import { ApiKeySkeleton } from "./api-key-skeleton";
import { CreateApiKeyDialog } from "./create-api-key-dialog";

export function ApiKeys({
	organizationId,
	page,
	onPageChange,
}: {
	organizationId: string;
	page: number;
	onPageChange: (page: number) => void;
}) {
	const { t } = useTranslation();
	const keys = useQuery(apiKeysQuery(organizationId, page));
	const members = useQuery(membersQuery(organizationId));
	const frozen = useOrgFrozen(organizationId);
	const { canManage } = useOrgRole(organizationId);
	const locked = frozen || !canManage;
	const [createOpen, setCreateOpen] = useState(false);
	const totalPages = keys.data ? pageCount(keys.data) : 1;
	useEffect(() => {
		if (keys.isSuccess && page > totalPages) onPageChange(totalPages);
	}, [keys.isSuccess, page, totalPages, onPageChange]);
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title={t("settings.apiKeys")}
				actions={
					<>
						<Button variant="outline" render={<Link to="/api-docs" />}>
							<ExternalLink />
							{t("apiKeys.viewDocs")}
						</Button>
						<Button
							disabled={locked || keys.isPending}
							onClick={() => setCreateOpen(true)}
						>
							{t("apiKeys.create")}
						</Button>
					</>
				}
			/>
			<Card className="p-0">
				<CardContent className="p-0">
					{keys.isPending ? (
						<ApiKeySkeleton />
					) : keys.isError ? (
						<p role="alert" className="text-destructive p-6 text-sm">
							{apiErrorMessage(t, keys.error)}
						</p>
					) : keys.data.items.length === 0 ? (
						<EmptyState title={t("apiKeys.empty")} />
					) : (
						<ItemGroup className="gap-0">
							{keys.data.items.map((key, index) => (
								<Fragment key={key.id}>
									{index > 0 && <ItemSeparator />}
									<ApiKey
										apiKey={key}
										organizationId={organizationId}
										creator={
											members.data?.find(
												(member) => member.userId === key.createdById,
											)?.user.name
										}
										locked={locked}
									/>
								</Fragment>
							))}
						</ItemGroup>
					)}
				</CardContent>
			</Card>
			<div className="text-muted-foreground flex items-center justify-between text-sm">
				<span>
					{keys.data ? t("apiKeys.keyCount", { count: keys.data.total }) : ""}
				</span>
				<TablePagination
					page={page}
					total={keys.data?.total}
					totalPages={totalPages}
					onPageChange={onPageChange}
					disabled={keys.isPending}
				/>
			</div>
			<CreateApiKeyDialog
				organizationId={organizationId}
				open={createOpen}
				onOpenChange={setCreateOpen}
				locked={locked}
			/>
		</div>
	);
}
