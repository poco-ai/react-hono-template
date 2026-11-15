import { createCycleSchema } from "@workspace/shared";
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
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { DateField } from "@/components/date-field";
import { MutationError } from "@/components/mutation-error";
import {
	cycleEndsAtIso,
	cycleStartsAtIso,
	nextCycleRange,
} from "@/features/cycles/cycle-utils";
import {
	type CycleWithProgressDto,
	useCreateCycle,
	useUpdateCycle,
} from "@/features/cycles/data";
import { toDateInputValue } from "@/lib/format";
import { useZodForm } from "@/lib/use-zod-form";

type CycleFormValues = { name: string; startsAt: string; endsAt: string };

/**
 * Date inputs are UTC calendar days: the cycle starts at UTC midnight and ends
 * at the last millisecond of the end day, matching the API's inclusive end-day
 * rule. `createCycleSchema` still owns the "end after start" refinement.
 */
const cycleFormSchema = z.preprocess((values) => {
	// Guard non-object input so the wrapper cannot throw a TypeError before zod
	// gets a chance to report validation issues.
	if (!values || typeof values !== "object") {
		return values;
	}
	const input = values as CycleFormValues;
	return {
		name: input.name.trim(),
		startsAt: cycleStartsAtIso(input.startsAt),
		endsAt: cycleEndsAtIso(input.endsAt),
	};
}, createCycleSchema);

const INPUT_IDS = { name: "cycle-name" };

/** Both date controls share the range error; the copy matches the old dialog. */
const PATTERN_KEYS = {
	name: "cycles.nameRequired",
	startsAt: "cycles.rangeInvalid",
	endsAt: "cycles.rangeInvalid",
};

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
	const createMutation = useCreateCycle(orgId, projectId);
	const updateMutation = useUpdateCycle(orgId, projectId);
	const pending = createMutation.isPending || updateMutation.isPending;
	const error = cycle ? updateMutation.error : createMutation.error;
	const editing = Boolean(cycle);

	const close = () => onOpenChange(false);

	const { form, fieldErrors, handleSubmit, reset } =
		useZodForm<CycleFormValues>({
			defaultValues: { name: "", startsAt: "", endsAt: "" },
			schema: cycleFormSchema,
			onSubmit: (input) => {
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
			},
			t,
			patternKeys: PATTERN_KEYS,
			inputIds: INPUT_IDS,
		});

	useEffect(() => {
		if (!open) {
			return;
		}
		if (cycle) {
			reset({
				name: cycle.name,
				startsAt: toDateInputValue(cycle.startsAt),
				endsAt: toDateInputValue(cycle.endsAt),
			});
		} else {
			const range = nextCycleRange();
			reset({ name: "", startsAt: range.startsAt, endsAt: range.endsAt });
		}
	}, [open, cycle, reset]);

	// One message under the date grid, like the previous dialog.
	const rangeError = fieldErrors.startsAt ?? fieldErrors.endsAt;

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
					onSubmit={handleSubmit}
				>
					<form.Field name="name">
						{(field) => (
							<Field data-invalid={fieldErrors.name ? true : undefined}>
								<FieldLabel htmlFor="cycle-name">{t("cycles.name")}</FieldLabel>
								<Input
									id="cycle-name"
									value={field.state.value}
									placeholder={t("cycles.namePlaceholder")}
									maxLength={100}
									aria-invalid={fieldErrors.name ? true : undefined}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
								<FieldError>{fieldErrors.name}</FieldError>
							</Field>
						)}
					</form.Field>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<form.Field name="startsAt">
							{(field) => (
								<Field data-invalid={rangeError ? true : undefined}>
									<FieldLabel htmlFor="cycle-start">
										{t("cycles.startsAt")}
									</FieldLabel>
									<DateField
										id="cycle-start"
										value={field.state.value}
										invalid={Boolean(rangeError)}
										onChange={field.handleChange}
									/>
								</Field>
							)}
						</form.Field>
						<form.Field name="endsAt">
							{(field) => (
								<Field data-invalid={rangeError ? true : undefined}>
									<FieldLabel htmlFor="cycle-end">
										{t("cycles.endsAt")}
									</FieldLabel>
									<DateField
										id="cycle-end"
										value={field.state.value}
										invalid={Boolean(rangeError)}
										onChange={field.handleChange}
									/>
								</Field>
							)}
						</form.Field>
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
