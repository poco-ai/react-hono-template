import type { RecurrenceCadence } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DateField } from "@/components/date-field";
import { MutationError } from "@/components/mutation-error";
import {
	buildCreateRecurrenceInput,
	CADENCE_OPTIONS,
	cadenceLabelKey,
	defaultRecurrenceDate,
	recurrenceNextRunAt,
	useCreateRecurrence,
} from "@/features/recurrences/data";
import { todayDateOnly } from "@/lib/date";
import { formatDate } from "@/lib/format";

/**
 * "Make recurring" dialog opened from an issue. Only the cadence and first run
 * date are sent: the API snapshots the issue's fields at creation time, so
 * later issue edits never change the recurrence.
 */
export function RecurrenceDialog({
	open,
	onOpenChange,
	orgId,
	projectId,
	issueId,
	issueKey,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: string;
	projectId: string;
	issueId: string;
	issueKey: string;
}) {
	const { t } = useTranslation();
	const [cadence, setCadence] = useState<RecurrenceCadence>("weekly");
	const [date, setDate] = useState(defaultRecurrenceDate());

	useEffect(() => {
		if (open) {
			setCadence("weekly");
			setDate(defaultRecurrenceDate());
		}
	}, [open]);

	const mutation = useCreateRecurrence(orgId, projectId, {
		onSuccess: () => {
			toast.success(t("toast.recurrenceCreated"));
			onOpenChange(false);
		},
	});

	const nextRunAt = recurrenceNextRunAt(date);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("recurrences.makeRecurring")}</DialogTitle>
					<DialogDescription>
						{t("recurrences.makeRecurringDescription", { key: issueKey })}
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						mutation.mutate(
							buildCreateRecurrenceInput({ cadence, date, issueId }),
						);
					}}
				>
					<Field>
						<FieldLabel htmlFor="recurrence-cadence">
							{t("recurrences.cadenceLabel")}
						</FieldLabel>
						<Select
							value={cadence}
							onValueChange={(value) => setCadence(value as RecurrenceCadence)}
						>
							<SelectTrigger id="recurrence-cadence" className="w-full">
								<SelectValue>{t(cadenceLabelKey(cadence))}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{CADENCE_OPTIONS.map((option) => (
									<SelectItem key={option} value={option}>
										{t(cadenceLabelKey(option))}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="recurrence-first-run">
							{t("recurrences.firstRun")}
						</FieldLabel>
						<DateField
							id="recurrence-first-run"
							value={date}
							min={todayDateOnly()}
							clearable={false}
							onChange={setDate}
						/>
					</Field>
					<div className="text-muted-foreground flex items-start gap-2 rounded-md border p-3 text-xs">
						<CalendarClock className="mt-0.5 size-4 shrink-0" />
						<span>
							{t("recurrences.preview", {
								cadence: t(cadenceLabelKey(cadence)),
								date: formatDate(nextRunAt),
							})}
						</span>
					</div>
					{mutation.isError && <MutationError error={mutation.error} />}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{t("recurrences.createAction")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
