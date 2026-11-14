import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IssuePropertiesPanel } from "@/features/issues/components/issue-properties-panel";

/**
 * Mobile properties editor: a bottom sheet hosting the exact same
 * `IssuePropertiesPanel` the desktop aside renders (the panel is controlled —
 * its only local state is a draft synced from props — so two mounted
 * instances do not diverge).
 */
export function IssuePropertiesSheet({
	open,
	onOpenChange,
	footer,
	...panelProps
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Optional error surfaces shown under the panel (mobile only). */
	footer?: ReactNode;
} & ComponentProps<typeof IssuePropertiesPanel>) {
	const { t } = useTranslation();
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				className="max-h-[85svh] gap-0 pb-[env(safe-area-inset-bottom)]"
			>
				<SheetHeader className="border-b">
					<SheetTitle>{t("issues.properties")}</SheetTitle>
				</SheetHeader>
				<div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
					<IssuePropertiesPanel {...panelProps} />
					{footer}
				</div>
			</SheetContent>
		</Sheet>
	);
}
