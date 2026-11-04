import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { CalendarRange, X } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Removable chip for the flat `cycleId` URL filter. */
export function CycleFilterBadge({
	name,
	onClear,
}: {
	name: string;
	onClear: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Badge variant="secondary" className="gap-1.5 rounded-md py-1">
			<CalendarRange className="size-3.5" />
			<span className="max-w-48 truncate">
				{t("cycles.filterChip", { name })}
			</span>
			<Button
				variant="ghost"
				size="icon"
				className="text-muted-foreground hover:text-foreground size-4"
				aria-label={t("cycles.clearFilter")}
				onClick={onClear}
			>
				<X className="size-3" />
			</Button>
		</Badge>
	);
}
