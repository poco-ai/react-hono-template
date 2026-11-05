import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DateField } from "@/components/date-field";
import { MutationError } from "@/components/mutation-error";
import {
	cycleEndsAtIso,
	cycleRangeValid,
	cycleStartsAtIso,
	nextCycleRange,
} from "@/features/cycles/cycle-utils";
import {
	type CycleWithProgressDto,
	useCreateCycle,
	useUpdateCycle,
} from "@/features/cycles/data";
import { toDateInputValue } from "@/lib/format";

/** Create/edit dialog for a cycle: name plus a two-date range. */
export function CycleFormDialog({
	orgId,
	projectId,
	open,
	onOpenChange,
	cycle,
}: {
	orgId: string;
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** When set the dialog edits this cycle; otherwise it creates one. */
	cycle?: CycleWithProgressDto;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [startsAt, setStartsAt] = useState("");
	const [endsAt, setEndsAt] = useState("");
	const [nameError, setNameError] = useState<string>();
	const [rangeError, setRangeError] = useState<string>();

	const createMutation = useCreateCycle(orgId, projectId);
	const updateMutation = useUpdateCycle(orgId, projectId);
	const pending = createMutation.isPending || updateMutation.isPending;
	const error = cycle ? updateMutation.error : createMutation.error;
	const editing = Boolean(cycle);

	useEffect(() => {
		if (!open) {
			return;
		}
		if (cycle) {
			setName(cycle.name);
			setStartsAt(toDateInputValue(cycle.startsAt));
			setEndsAt(toDateInputValue(cycle.endsAt));
		} else {
			const range = nextCycleRange();
			setName("");
			setStartsAt(range.startsAt);
			setEndsAt(range.endsAt);
		}
		setNameError(undefined);
		setRangeError(undefined);
	}, [open, cycle]);

	const close = () => onOpenChange(false);

	const submit = () => {
		const trimmed = name.trim();
		if (!trimmed) {
			setNameError(t("cycles.nameRequired"));
			return;
		}
		if (!cycleRangeValid(startsAt, endsAt)) {
			setRangeError(t("cycles.rangeInvalid"));
			return;
		}
		// Date inputs are UTC calendar days: the cycle starts at UTC midnight and
		// ends at the last millisecond of the end day, matching the API's
		// inclusive end-day rule.
		const startsAtIso = cycleStartsAtIso(startsAt);
		const endsAtIso = cycleEndsAtIso(endsAt);
		if (!startsAtIso || !endsAtIso) {
			setRangeError(t("cycles.rangeInvalid"));
			return;
		}
		const input = { name: trimmed, startsAt: startsAtIso, endsAt: endsAtIso };
		const onSuccess = () => {
			toast.success(
				editing ? t("toast.cycleUpdated") : t("toast.cycleCreated"),
			);
			close();
		};
		if (cycle) {
			updateMutation.mutate({ cycleId: cycle.id, input }, { onSuccess });
		} else {
			createMutation.mutate(input, { onSuccess });
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{editing ? t("cycles.editTitle") : t("cycles.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{editing
							? t("cycles.editDescription")
							: t("cycles.createDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<Field data-invalid={nameError ? true : undefined}>
						<FieldLabel htmlFor="cycle-name">{t("cycles.name")}</FieldLabel>
						<Input
							id="cycle-name"
							value={name}
							placeholder={t("cycles.namePlaceholder")}
							aria-invalid={nameError ? true : undefined}
							onChange={(event) => {
								setName(event.target.value);
								setNameError(undefined);
							}}
						/>
						<FieldError>{nameError}</FieldError>
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field data-invalid={rangeError ? true : undefined}>
							<FieldLabel htmlFor="cycle-start">
								{t("cycles.startsAt")}
							</FieldLabel>
							<DateField
								id="cycle-start"
								value={startsAt}
								invalid={Boolean(rangeError)}
								onChange={(value) => {
									setStartsAt(value);
									setRangeError(undefined);
								}}
							/>
						</Field>
						<Field data-invalid={rangeError ? true : undefined}>
							<FieldLabel htmlFor="cycle-end">{t("cycles.endsAt")}</FieldLabel>
							<DateField
								id="cycle-end"
								value={endsAt}
								invalid={Boolean(rangeError)}
								onChange={(value) => {
									setEndsAt(value);
									setRangeError(undefined);
								}}
							/>
						</Field>
					</div>
					<FieldError>{rangeError}</FieldError>
					{error && <MutationError error={error} />}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={close}
							disabled={pending}
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={pending}>
							{pending && <Spinner />}
							{editing ? t("common.save") : t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
