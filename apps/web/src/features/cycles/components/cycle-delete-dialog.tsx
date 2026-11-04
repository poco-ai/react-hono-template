import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
	type CycleWithProgressDto,
	useDeleteCycle,
} from "@/features/cycles/data";
import { apiErrorMessage } from "@/lib/errors";

/** Destructive confirmation: issues survive, they are just detached. */
export function CycleDeleteDialog({
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
	cycle?: CycleWithProgressDto;
}) {
	const { t } = useTranslation();
	const deleteMutation = useDeleteCycle(orgId, projectId, {
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});

	const confirm = () => {
		if (!cycle) {
			return;
		}
		deleteMutation.mutate(cycle.id, {
			onSuccess: () => {
				toast.success(t("toast.cycleDeleted"));
				onOpenChange(false);
			},
		});
	};

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("cycles.deleteTitle")}
			description={t("cycles.deleteDescription", {
				name: cycle?.name ?? "",
			})}
			confirmLabel={t("cycles.delete")}
			pending={deleteMutation.isPending}
			onConfirm={confirm}
		/>
	);
}
