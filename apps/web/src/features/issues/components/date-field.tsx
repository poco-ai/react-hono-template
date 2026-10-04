import { Button } from "@workspace/ui/components/button";
import { Calendar, enUS, zhCN } from "@workspace/ui/components/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDueDate, getDueDateStatus } from "@/lib/format";

function dateToInputValue(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

function parseInputValue(value: string): Date | undefined {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) {
		return undefined;
	}
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function DateField({
	value,
	onChange,
	disabled,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
}) {
	const { t, i18n } = useTranslation();
	const [open, setOpen] = useState(false);
	const locale = i18n.language.startsWith("zh") ? zhCN : enUS;
	const selected = parseInputValue(value);
	const status = getDueDateStatus(value);
	const statusLabel =
		status === "overdue"
			? t("issues.dueOverdue")
			: status === "today"
				? t("issues.dueToday")
				: status === "tomorrow"
					? t("issues.dueTomorrow")
					: null;

	const commit = (next: string) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						className={cn("w-full justify-start font-normal", className)}
						disabled={disabled}
					/>
				}
			>
				<CalendarIcon className="text-muted-foreground size-4 shrink-0" />
				{selected ? (
					<>
						<span
							className={cn(
								"min-w-0 truncate",
								status === "overdue" && "text-destructive",
							)}
						>
							{formatDueDate(value)}
						</span>
						{statusLabel && (
							<span
								className={cn(
									"ml-auto text-xs",
									status === "overdue"
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
						{t("issues.duePlaceholder")}
					</span>
				)}
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto gap-0 p-2">
				<Calendar
					mode="single"
					locale={locale}
					defaultMonth={selected}
					selected={selected}
					onSelect={(date) => commit(date ? dateToInputValue(date) : "")}
				/>
				<div className="flex gap-2 border-t pt-2">
					<Button
						variant="outline"
						size="sm"
						className="flex-1"
						onClick={() => commit(dateToInputValue(new Date()))}
					>
						{t("issues.dueToday")}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="flex-1"
						disabled={!selected}
						onClick={() => commit("")}
					>
						{t("issues.dueClear")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
