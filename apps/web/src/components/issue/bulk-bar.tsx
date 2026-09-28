import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	ISSUE_PRIORITIES,
	ISSUE_STATUSES,
	type IssuePriorityName,
	type IssueStatus,
	type UpdateIssueInput,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { client, unwrap } from "@/lib/api";
import { priorityValue } from "@/lib/issue-utils";
import { orgActivitiesRootKey } from "@/lib/queries/activities";

const PRIORITY_NAMES = ISSUE_PRIORITIES.map((p) => p.name);
const NO_ACTION = "__action__";

export function BulkActionBar({
	orgId,
	projectId,
	numbers,
	onDone,
}: {
	orgId: string;
	projectId: string;
	numbers: number[];
	onDone: () => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	const bulkMutation = useMutation({
		mutationFn: async (input: UpdateIssueInput) => {
			const results = await Promise.allSettled(
				numbers.map((number) =>
					unwrap(
						client.api.orgs[":orgId"].projects[":projectId"].issues[
							":number"
						].$patch({
							param: { orgId, projectId, number: String(number) },
							json: input,
						}),
					),
				),
			);
			const failed = results.filter((r) => r.status === "rejected").length;
			if (failed > 0) {
				throw new Error(
					t("bulk.partialFailure", { failed, total: numbers.length }),
				);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "projects"] });
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "issues"] });
			queryClient.invalidateQueries({
				queryKey: orgActivitiesRootKey(orgId),
			});
			onDone();
		},
	});

	return (
		<div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border bg-background px-4 py-2 shadow-lg">
			<span className="text-sm font-medium whitespace-nowrap">
				{t("bulk.selected", { count: numbers.length })}
			</span>
			<Select
				value={NO_ACTION}
				onValueChange={(v) =>
					v && bulkMutation.mutate({ status: v as IssueStatus })
				}
			>
				<SelectTrigger className="h-8 w-36">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_ACTION}>{t("bulk.changeStatus")}</SelectItem>
					{ISSUE_STATUSES.map((status) => (
						<SelectItem key={status} value={status}>
							{t(`issues.statuses.${status}`)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={NO_ACTION}
				onValueChange={(v) =>
					v &&
					bulkMutation.mutate({
						priority: priorityValue(v as IssuePriorityName),
					})
				}
			>
				<SelectTrigger className="h-8 w-36">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_ACTION}>{t("bulk.changePriority")}</SelectItem>
					{PRIORITY_NAMES.map((name) => (
						<SelectItem key={name} value={name}>
							{t(`issues.priorities.${name}`)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{bulkMutation.isPending && (
				<Loader2 className="text-muted-foreground size-4 animate-spin" />
			)}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={t("bulk.clear")}
				disabled={bulkMutation.isPending}
				onClick={onDone}
			>
				<X />
			</Button>
			{bulkMutation.isError && (
				<span className="text-destructive max-w-48 truncate text-xs">
					{bulkMutation.error.message}
				</span>
			)}
		</div>
	);
}
