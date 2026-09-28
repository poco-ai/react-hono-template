export function LabelBadge({
	label,
	className,
}: {
	label: { name: string; color: string };
	className?: string;
}) {
	return (
		<span
			className={`inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className ?? ""}`}
		>
			<span
				className="size-2 shrink-0 rounded-full"
				style={{ backgroundColor: label.color }}
			/>
			{label.name}
		</span>
	);
}
