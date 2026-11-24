import { useQuery } from "@tanstack/react-query";
import type { IssueQuery } from "@workspace/shared";
import type { IssueQueryState } from "@/features/issues/query";
import { ViewSwitcher } from "@/features/views/components/view-switcher";
import { viewsQuery } from "@/features/views/data";
import { useViewDetach } from "@/features/views/use-view-detach";
import type {
	IssueViewState,
	IssueViewStateArgs,
	WebFeatureDecl,
} from "@/features/web-types";

/**
 * Saved-view integration for the issue list. Views owns the query, the detach
 * state and the switcher; the issue page only renders `toolbar` and merges
 * `currentViewQuery` into its resolved query.
 */
function useIssueViews(args: IssueViewStateArgs): IssueViewState {
	const views = useQuery(viewsQuery(args.orgId, args.projectId));
	const currentView = args.viewId
		? views.data?.find((entry) => entry.id === args.viewId)
		: undefined;
	const resolved = args.resolved as unknown as IssueQueryState;
	const setSearch = (next: Partial<Record<string, unknown>>) =>
		args.setSearch(next as Record<string, unknown>);

	const { dirtyView, clearDirtyView, detachView, updateSearch } = useViewDetach(
		{
			viewId: args.viewId,
			currentView,
			resolved,
			views: {
				data: views.data,
				isSuccess: views.isSuccess,
				isFetching: views.isFetching,
			},
			setSearch: (next) => args.setSearch(next as Record<string, unknown>),
			onSelectionReset: args.onSelectionReset,
		},
	);

	const resetSearch = (view: typeof currentView) => {
		clearDirtyView();
		args.onSelectionReset();
		setSearch({
			viewId: view?.id,
			filter: "",
			sort: "updated",
			groupBy: undefined,
			statusId: "",
			status: "",
			priority: "",
			assigneeId: "",
			labelId: "",
			cycleId: "",
			page: 1,
			...(view ? { view: view.layout === "board" ? "board" : "list" } : {}),
		});
	};

	const savedQuery: IssueQuery = {
		filter: args.resolved.filter,
		sort: args.resolved.sorts as IssueQuery["sort"],
		groupBy: (args.resolved.groupBy as IssueQuery["groupBy"]) ?? null,
		layout: args.layout,
	};

	const toolbar = (
		<ViewSwitcher
			orgId={args.orgId}
			projectId={args.projectId}
			views={views.data ?? []}
			viewsLoading={views.isPending}
			viewsError={views.isError ? views.error : null}
			onRetryViews={() => {
				void views.refetch();
			}}
			currentView={currentView}
			dirtyView={dirtyView}
			query={savedQuery}
			layout={args.layout}
			canManage={args.canManage}
			currentUserId={args.currentUserId}
			onApply={(next) => {
				resetSearch(next);
				setSearch({ view: next.layout === "board" ? "board" : "list" });
			}}
			onUpdated={(next) => {
				resetSearch(next);
			}}
			onCleared={() => resetSearch(undefined)}
		/>
	);

	return {
		currentViewQuery: currentView?.query,
		detach: detachView as IssueViewState["detach"],
		updateSearch: (next) => updateSearch(next as never),
		toolbar,
	};
}

function useIssueViewState(
	args: IssueViewStateArgs,
): Pick<IssueViewState, "currentViewQuery"> {
	return { currentViewQuery: useIssueViews(args).currentViewQuery };
}

function useIssueViewDetach(
	args: IssueViewStateArgs,
): Pick<IssueViewState, "detach" | "updateSearch" | "toolbar"> {
	const { detach, updateSearch, toolbar } = useIssueViews(args);
	return { detach, updateSearch, toolbar };
}

/** Views: saved view switcher and query resolution for the issue list. */
export const viewsWeb: WebFeatureDecl = {
	id: "views",
	issueExtras: { useIssueViewState, useIssueViewDetach },
};
