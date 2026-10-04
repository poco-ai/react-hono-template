import { useTranslation } from "react-i18next";
import { UsageBar } from "@/features/billing/components/usage-bar";

export function UsageRow({
	label,
	usage,
	cap,
	unavailableNote,
	onUnlock,
}: {
	label: string;
	usage: number;
	cap: number;
	unavailableNote?: string;
	onUnlock?: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between text-sm">
				<span>{label}</span>
				<span className="text-muted-foreground">
					{cap === 0 ? "—" : t("billing.usageOf", { current: usage, cap })}
				</span>
			</div>
			<UsageBar usage={usage} cap={cap} />
			{cap === 0 && unavailableNote && (
				<p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
					<span>{unavailableNote}</span>
					{onUnlock && (
						<button
							type="button"
							onClick={onUnlock}
							className="text-foreground shrink-0 font-medium underline-offset-2 hover:underline"
						>
							{t("billing.upgradeToUnlock")}
						</button>
					)}
				</p>
			)}
		</div>
	);
}
