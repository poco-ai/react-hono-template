import { Button } from "@workspace/ui/components/button";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "@workspace/ui/components/pagination";
import { useTranslation } from "react-i18next";

export function TablePagination({
	page,
	total,
	totalPages,
	onPageChange,
	disabled = false,
}: {
	page: number;
	total: number | undefined;
	totalPages: number;
	onPageChange: (page: number) => void;
	disabled?: boolean;
}) {
	const { t } = useTranslation();

	if (total === 0 || totalPages <= 1) {
		return null;
	}

	return (
		<Pagination className="justify-start">
			<PaginationContent className="flex-wrap">
				<PaginationItem>
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1 || disabled}
						onClick={() => onPageChange(page - 1)}
					>
						{t("common.prev")}
					</Button>
				</PaginationItem>
				<PaginationItem>
					<span className="text-muted-foreground px-2 text-sm tabular-nums">
						{t("issues.pageIndicator", { page, total: totalPages })}
					</span>
				</PaginationItem>
				<PaginationItem>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages || disabled}
						onClick={() => onPageChange(page + 1)}
					>
						{t("common.next")}
					</Button>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	);
}
