import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Progress } from "@workspace/ui/components/progress";
import { useTranslation } from "react-i18next";
import { billingQuery } from "@/features/billing/data";

const formatQuantity = (unit: string, value: number) => {
	if (unit === "bytes") {
		const mb = value / (1024 * 1024);
		return `${mb.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
	}
	return value.toLocaleString();
};

export function QuotaSummary({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	const query = useQuery(billingQuery(orgId));
	const meters = query.data?.meters ?? [];
	const credits = query.data?.credits;
	if (!query.data || meters.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("quota.title")}</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{credits && (
					<div className="flex items-baseline justify-between gap-4">
						<span className="font-medium">{t("quota.credits")}</span>
						<span className="text-muted-foreground text-sm">
							{t("quota.available", { available: credits.available })}
							{" · "}
							{t("quota.reserved", { reserved: credits.reserved })}
						</span>
					</div>
				)}
				{meters.map((meter) => {
					const unlimited = meter.included < 0;
					const percent = unlimited
						? 0
						: Math.min(100, (meter.used / Math.max(meter.included, 1)) * 100);
					return (
						<div key={meter.meter} className="flex flex-col gap-2">
							<div className="flex items-baseline justify-between gap-4 text-sm">
								<span>
									{t(`quota.meters.${meter.meter}`)}
									<span className="text-muted-foreground">
										{" · "}
										{t(`quota.mode.${meter.mode}`)}
									</span>
								</span>
								<span className="text-muted-foreground">
									{unlimited
										? t("quota.unlimited")
										: t("billing.usageOf", {
												current: formatQuantity(meter.unit, meter.used),
												cap: formatQuantity(meter.unit, meter.included),
											})}
								</span>
							</div>
							{unlimited ? null : <Progress value={percent} />}
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}
