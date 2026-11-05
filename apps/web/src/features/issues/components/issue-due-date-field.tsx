import { useTranslation } from "react-i18next";
import { DateField, type DateFieldProps } from "@/components/date-field";

export type IssueDueDateFieldProps = Omit<
	DateFieldProps,
	"placeholder" | "showRelativeStatus" | "relativeStatusVariant" | "labels"
>;

/**
 * Issue due date: the shared date picker with the issue wording and the
 * overdue/today/tomorrow hints (issue keys, not `common.*`).
 */
export function IssueDueDateField(props: IssueDueDateFieldProps) {
	const { t } = useTranslation();
	return (
		<DateField
			{...props}
			placeholder={t("issues.duePlaceholder")}
			showRelativeStatus
			relativeStatusVariant="destructive"
			labels={{
				todayAction: t("issues.dueToday"),
				clearAction: t("issues.dueClear"),
				status: {
					overdue: t("issues.dueOverdue"),
					today: t("issues.dueToday"),
					tomorrow: t("issues.dueTomorrow"),
				},
			}}
		/>
	);
}
