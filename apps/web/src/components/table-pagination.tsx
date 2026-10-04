import { Button } from "@workspace/ui/components/button";
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
		<div className="flex flex-wrap items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={page <= 1 || disabled}
				onClick={() => onPageChange(page - 1)}
			>
				{t("common.prev")}
			</Button>
			<span className="text-muted-foreground">
				{t("issues.pageIndicator", { page, total: totalPages })}
			</span>
			<Button
				variant="outline"
				size="sm"
				disabled={page >= totalPages || disabled}
				onClick={() => onPageChange(page + 1)}
			>
				{t("common.next")}
			</Button>
		</div>
	);
}
