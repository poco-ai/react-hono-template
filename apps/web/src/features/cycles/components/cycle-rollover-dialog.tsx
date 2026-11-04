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
import { Spinner } from "@workspace/ui/components/spinner";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MutationError } from "@/components/mutation-error";
import {
	cycleStatusAt,
	rolloverMoveCount,
} from "@/features/cycles/cycle-utils";
import {
	type CycleWithProgressDto,
	useRolloverCycle,
} from "@/features/cycles/data";
import { formatUtcDate } from "@/lib/format";

/**
 * Moves the unfinished issues of one cycle into a later cycle. Targets are
 * limited to cycles that have not ended yet, mirroring the API rule.
 */
export function CycleRolloverDialog({
	orgId,
	projectId,
	open,
	onOpenChange,
	cycle,
	cycles,
}: {
	orgId: string;
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	cycle?: CycleWithProgressDto;
	/** Every cycle of the project; the source is filtered out. */
	cycles: CycleWithProgressDto[];
}) {
	const { t } = useTranslation();
	const [targetCycleId, setTargetCycleId] = useState("");
	const mutation = useRolloverCycle(orgId, projectId);

	// Mirror the API rule: only cycles that have not ended yet are targets, and
	// the end day itself is still inclusive.
	const targets = cycle
		? cycles.filter(
				(entry) =>
					entry.id !== cycle.id &&
					cycleStatusAt(entry.startsAt, entry.endsAt) !== "past",
			)
		: [];

	useEffect(() => {
		if (!open || !cycle) {
			return;
		}
		const first = cycles.find(
			(entry) =>
				entry.id !== cycle.id &&
				cycleStatusAt(entry.startsAt, entry.endsAt) !== "past",
		);
		setTargetCycleId(first?.id ?? "");
	}, [open, cycle, cycles]);

	const moves = cycle ? rolloverMoveCount(cycle) : 0;

	const submit = () => {
		if (!cycle || !targetCycleId) {
			return;
		}
		mutation.mutate(
			{ sourceCycleId: cycle.id, targetCycleId },
			{
				onSuccess: (result) => {
					toast.success(t("toast.cycleRolledOver", { count: result.moved }));
					onOpenChange(false);
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("cycles.rolloverTitle")}</DialogTitle>
					<DialogDescription>
						{t("cycles.rolloverDescription", { name: cycle?.name ?? "" })}
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					{targets.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{t("cycles.rolloverNoTargets")}
						</p>
					) : (
						<Field>
							<FieldLabel>{t("cycles.rolloverTarget")}</FieldLabel>
							<Select
								value={targetCycleId}
								onValueChange={(value) => value && setTargetCycleId(value)}
							>
								<SelectTrigger className="w-full">
									<SelectValue>
										{targets.find((entry) => entry.id === targetCycleId)
											?.name ?? t("cycles.rolloverTarget")}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{targets.map((entry) => (
										<SelectItem key={entry.id} value={entry.id}>
											{entry.name} · {formatUtcDate(entry.endsAt)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					)}
					<p className="text-sm">
						{t("cycles.rolloverMoves", { count: moves })}
					</p>
					<p className="text-muted-foreground text-xs">
						{t("cycles.rolloverHint")}
					</p>
					{mutation.isError && <MutationError error={mutation.error} />}
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						{t("common.cancel")}
					</Button>
					<Button
						onClick={submit}
						disabled={
							mutation.isPending || targets.length === 0 || !targetCycleId
						}
					>
						{mutation.isPending && <Spinner />}
						{t("cycles.rolloverSubmit")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
