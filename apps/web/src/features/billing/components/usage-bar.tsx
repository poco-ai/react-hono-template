export function UsageBar({ usage, cap }: { usage: number; cap: number }) {
	if (cap === 0) {
		return <div className="bg-muted/50 h-1.5 w-full rounded-full" />;
	}
	const pct = Math.min(100, (usage / cap) * 100);
	return (
		<div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
			<div
				className={`h-full rounded-full ${
					pct >= 100
						? "bg-destructive"
						: pct >= 80
							? "bg-amber-500 dark:bg-amber-400"
							: "bg-primary"
				}`}
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}
