import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Spinner } from "@workspace/ui/components/spinner";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MutationError } from "./mutation-error";

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	cancelLabel,
	variant = "destructive",
	pending = false,
	error,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	confirmLabel: ReactNode;
	cancelLabel?: ReactNode;
	variant?: "default" | "destructive";
	pending?: boolean;
	/** Mutation error rendered inside the dialog (kept open on failure). */
	error?: Error | null | undefined;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description && (
						<AlertDialogDescription>{description}</AlertDialogDescription>
					)}
				</AlertDialogHeader>
				<MutationError error={error} />
				<AlertDialogFooter>
					<AlertDialogCancel>
						{cancelLabel ?? t("common.cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						variant={variant}
						disabled={pending}
						onClick={(event) => {
							event.preventDefault();
							onConfirm();
						}}
					>
						{pending && <Spinner />}
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
