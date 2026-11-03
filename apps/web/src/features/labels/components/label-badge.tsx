import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";

export function LabelBadge({
	label,
	className,
}: {
	label: { name: string; color: string };
	className?: string;
}) {
	return (
		<Badge variant="outline" className={cn("gap-1.5 rounded-md", className)}>
			<span
				className="size-2 shrink-0 rounded-full"
				style={{ backgroundColor: label.color }}
			/>
			{label.name}
		</Badge>
	);
}
