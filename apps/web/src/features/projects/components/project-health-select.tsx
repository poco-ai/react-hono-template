import { PROJECT_HEALTH_VALUES, type ProjectHealth } from "@workspace/shared";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { useTranslation } from "react-i18next";
import { projectHealthOf } from "../utils";

const NO_HEALTH = "__none__";

/** Health picker that maps the "unset" option to `null`. */
export function ProjectHealthSelect({
	id,
	value,
	onChange,
	disabled,
	className,
}: {
	id?: string;
	value: ProjectHealth | null;
	onChange: (next: ProjectHealth | null) => void;
	disabled?: boolean;
	className?: string;
}) {
	const { t } = useTranslation();
	return (
		<Select
			value={value ?? NO_HEALTH}
			disabled={disabled}
			onValueChange={(next) =>
				onChange(next === NO_HEALTH ? null : projectHealthOf(next))
			}
		>
			<SelectTrigger id={id} className={className ?? "w-full sm:w-44"}>
				<SelectValue>
					{value
						? t(`projects.healthValues.${value}`)
						: t("projects.healthUnset")}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NO_HEALTH}>{t("projects.healthUnset")}</SelectItem>
				{PROJECT_HEALTH_VALUES.map((option) => (
					<SelectItem key={option} value={option}>
						{t(`projects.healthValues.${option}`)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
