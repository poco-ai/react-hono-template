import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { projectHealthMeta, projectHealthOf } from "../utils";

/** Health rollup badge; unset health renders a muted placeholder. */
export function ProjectHealthBadge({
	health,
	className,
}: {
	health: string | null | undefined;
	className?: string;
}) {
	const { t } = useTranslation();
	const value = projectHealthOf(health);
	const meta = projectHealthMeta(health);

	if (!value || !meta) {
		return (
			<Badge
				variant="outline"
				className={cn("text-muted-foreground rounded-md", className)}
			>
				{t("projects.healthUnset")}
			</Badge>
		);
	}

	return (
		<Badge
			variant="outline"
			className={cn("rounded-md border-transparent", meta.className, className)}
		>
			{t(`projects.healthValues.${value}`)}
		</Badge>
	);
}
