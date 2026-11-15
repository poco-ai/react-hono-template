import type { IssueFilterGroup } from "@workspace/shared";
import { useEffect, useState } from "react";
import type { ViewDto } from "@/features/views/data";
import { detachedFilterSearch, type IssueQueryState } from "./query";
import type { IssuesSearch } from "./search";

type SearchOverrides = Partial<Pick<IssuesSearch, "sort" | "groupBy" | "page">>;

/**
 * Owns the "applied saved view vs. locally edited query" state of the issue
 * list. Editing the filter, sort or grouping detaches from the view while
 * keeping its resolved query around so the switcher can offer "update" /
 * "save as"; the URL is the single source of truth for the rest.
 */
export function useViewDetach({
	viewId,
	currentView,
	resolved,
	views,
	setSearch,
	onSelectionReset,
}: {
	viewId?: string;
	currentView?: ViewDto;
	resolved: IssueQueryState;
	views: {
		data: ViewDto[] | undefined;
		isSuccess: boolean;
		isFetching: boolean;
	};
	setSearch: (next: Partial<IssuesSearch>) => void;
	onSelectionReset: () => void;
}) {
	const [dirtyView, setDirtyView] = useState<ViewDto | null>(null);

	useEffect(() => {
		if (viewId) {
			setDirtyView(null);
		}
	}, [viewId]);

	// A view id that no longer resolves to a visible view is a ghost filter:
	// drop it once the list has settled so URL state matches what is applied.
	useEffect(() => {
		if (!viewId || !views.isSuccess || views.isFetching) {
			return;
		}
		if ((views.data ?? []).some((entry) => entry.id === viewId)) {
			return;
		}
		setSearch({ viewId: undefined });
	}, [viewId, views.data, views.isSuccess, views.isFetching, setSearch]);

	/**
	 * Leaves the applied view (when there is one) while keeping its resolved
	 * sort/grouping, so changing the filter does not silently reset either.
	 */
	const detachView = (
		nextFilter: IssueFilterGroup | undefined,
		options: {
			search?: string;
			overrides?: SearchOverrides;
			/** Extra URL params applied on top of the detached patch. */
			extra?: Partial<IssuesSearch>;
		} = {},
	) => {
		onSelectionReset();
		if (currentView) {
			setDirtyView(currentView);
		}
		setSearch({
			...detachedFilterSearch({
				view: currentView?.query,
				resolved,
				filter: nextFilter,
				search: options.search,
				overrides: options.overrides,
			}),
			...options.extra,
		});
	};

	const updateSearch = (next: Partial<IssuesSearch>) => {
		onSelectionReset();
		if (currentView && ("sort" in next || "groupBy" in next)) {
			const overrides: SearchOverrides = {};
			if ("sort" in next) {
				overrides.sort = next.sort;
			}
			if ("groupBy" in next) {
				overrides.groupBy = next.groupBy;
			}
			if (next.page !== undefined) {
				overrides.page = next.page;
			}
			detachView(resolved.filter, { overrides });
			return;
		}
		setSearch(next);
	};

	return {
		dirtyView,
		clearDirtyView: () => setDirtyView(null),
		detachView,
		updateSearch,
	};
}
