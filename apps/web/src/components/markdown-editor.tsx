import { Textarea } from "@workspace/ui/components/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownContent } from "@/components/markdown";

type MarkdownEditorProps = {
	id?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	disabled?: boolean;
	rows?: number;
	maxLength?: number;
	ariaInvalid?: boolean;
	ariaDescribedBy?: string;
	footer?: ReactNode;
	className?: string;
	resetKey?: number;
};

export function MarkdownEditor({
	id,
	value,
	onChange,
	placeholder,
	disabled,
	rows,
	maxLength,
	ariaInvalid,
	ariaDescribedBy,
	footer,
	className,
	resetKey,
}: MarkdownEditorProps) {
	const { t } = useTranslation();
	const [tab, setTab] = useState<"write" | "preview">("write");

	useEffect(() => {
		if (resetKey !== undefined) {
			setTab("write");
		}
	}, [resetKey]);

	return (
		<div className={cn("rounded-lg border", className)}>
			<div className="border-b flex items-center gap-1 px-2 pt-1.5">
				<ToggleGroup
					value={[tab]}
					onValueChange={(next) => {
						if (next[0]) setTab(next[0] as "write" | "preview");
					}}
					spacing={0}
					className="pb-1.5"
				>
					<ToggleGroupItem value="write" size="sm">
						{t("common.write")}
					</ToggleGroupItem>
					<ToggleGroupItem value="preview" size="sm">
						{t("common.preview")}
					</ToggleGroupItem>
				</ToggleGroup>
			</div>
			{tab === "write" ? (
				<>
					<Textarea
						id={id}
						value={value}
						placeholder={placeholder}
						onChange={(e) => onChange(e.target.value)}
						disabled={disabled}
						rows={rows}
						maxLength={maxLength}
						aria-invalid={ariaInvalid ? true : undefined}
						aria-describedby={ariaDescribedBy}
						className="resize-y border-0 focus-visible:ring-0"
					/>
					<p className="text-muted-foreground px-3 pb-2 text-xs">
						{t("markdown.hint")}
					</p>
				</>
			) : (
				<div className="min-h-24 px-3 py-2">
					{value.trim() ? (
						<MarkdownContent>{value}</MarkdownContent>
					) : (
						<p className="text-muted-foreground text-sm">
							{t("comments.previewEmpty")}
						</p>
					)}
				</div>
			)}
			{footer}
		</div>
	);
}
