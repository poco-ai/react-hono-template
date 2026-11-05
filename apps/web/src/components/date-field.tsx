import { Button } from "@workspace/ui/components/button";
import { Calendar, enUS, zhCN } from "@workspace/ui/components/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { CalendarIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	dateToDateOnly,
	formatShortDateOnly,
	parseDateOnly,
	todayDateOnly,
} from "@/lib/date";
import { getDueDateStatus } from "@/lib/format";

type CalendarDisabled = ComponentProps<typeof Calendar>["disabled"];

export type DateFieldLabels = {
	/** Empty-state text. */
	placeholder?: string;
	/** Shortcut that picks today. */
	todayAction?: string;
	/** Shortcut that clears the selection (only with `clearable`). */
	clearAction?: string;
	/** Relative hints, rendered when `showRelativeStatus` is set. */
	status?: {
		overdue?: string;
		today?: string;
		tomorrow?: string;
	};
};

export type DateFieldProps = {
	/** Date-only value (`YYYY-MM-DD`); an empty string means "no date". */
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	id?: string;
	className?: string;
	invalid?: boolean;
	placeholder?: string;
	/** Show the Clear shortcut in the popover footer. */
	clearable?: boolean;
	/** Render the overdue/today/tomorrow hint next to the value. */
	showRelativeStatus?: boolean;
	/**
	 * `destructive` highlights overdue days in the destructive color;
	 * `muted` keeps the hint subdued.
	 */
	relativeStatusVariant?: "muted" | "destructive";
	/** Earliest selectable day, inclusive (`YYYY-MM-DD`). */
	min?: string;
	labels?: DateFieldLabels;
};

/** Locale object react-day-picker needs to render weekday/month names. */
function calendarLocale(language: string) {
	return language.startsWith("zh") ? zhCN : enUS;
}

/**
 * Date-only picker: a button that opens a shadcn Popover + Calendar. The value
 * stays a `YYYY-MM-DD` string (no time zone involved); parse/format helpers
 * live in `@/lib/date`. Feature code passes its own i18n labels when it needs
 * domain-specific wording (e.g. issue "due date" hints).
 */
export function DateField({
	value,
	onChange,
	disabled,
	id,
	className,
	invalid,
	placeholder,
	clearable = true,
	showRelativeStatus = false,
	relativeStatusVariant = "muted",
	min,
	labels,
}: DateFieldProps) {
	const { t, i18n } = useTranslation();
	const [open, setOpen] = useState(false);
	const selected = parseDateOnly(value);

	const status = showRelativeStatus ? getDueDateStatus(value) : null;
	const statusLabel = status ? labels?.status?.[status] : undefined;
	const highlightOverdue =
		relativeStatusVariant === "destructive" && status === "overdue";

	const minDate = min ? parseDateOnly(min) : undefined;
	const disabledDays: CalendarDisabled = minDate ? [{ before: minDate }] : [];
	const today = todayDateOnly();
	const todayOutOfRange = min !== undefined && today < min;

	const commit = (next: string) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						id={id}
						type="button"
						variant="outline"
						className={cn("w-full justify-start font-normal", className)}
						disabled={disabled}
						aria-invalid={invalid ? true : undefined}
					/>
				}
			>
				<CalendarIcon className="text-muted-foreground size-4 shrink-0" />
				{selected ? (
					<>
						<span
							className={cn(
								"min-w-0 truncate",
								highlightOverdue && "text-destructive",
							)}
						>
							{formatShortDateOnly(value, i18n.language)}
						</span>
						{statusLabel && (
							<span
								className={cn(
									"ml-auto text-xs",
									highlightOverdue
										? "text-destructive"
										: "text-muted-foreground",
								)}
							>
								{statusLabel}
							</span>
						)}
					</>
				) : (
					<span className="text-muted-foreground font-normal">
						{placeholder ?? t("common.setDate")}
					</span>
				)}
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto gap-0 p-2">
				<Calendar
					mode="single"
					locale={calendarLocale(i18n.language)}
					defaultMonth={selected ?? minDate}
					selected={selected}
					disabled={disabledDays.length > 0 ? disabledDays : undefined}
					onSelect={(date) => {
						// Deselecting the picked day clears the value; a required
						// field ignores that gesture instead of committing "".
						if (!date && !clearable) {
							return;
						}
						commit(date ? dateToDateOnly(date) : "");
					}}
				/>
				<div className="flex gap-2 border-t pt-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="flex-1"
						disabled={todayOutOfRange}
						onClick={() => commit(today)}
					>
						{labels?.todayAction ?? t("common.today")}
					</Button>
					{clearable && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="flex-1"
							disabled={!selected}
							onClick={() => commit("")}
						>
							{labels?.clearAction ?? t("common.clear")}
						</Button>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
