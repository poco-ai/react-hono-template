import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Loader2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownContent } from "@/components/markdown";

export function IssueDescription({
	description,
	disabled,
	onSave,
}: {
	description: string | null;
	disabled?: boolean;
	onSave: (description: string | null) => Promise<boolean>;
}) {
	const { t } = useTranslation();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const [pending, setPending] = useState(false);

	useEffect(() => {
		if (editing) {
			setDraft(description ?? "");
		}
	}, [editing, description]);

	const save = async () => {
		setPending(true);
		try {
			const ok = await onSave(draft.trim() || null);
			if (ok) {
				setEditing(false);
			}
		} finally {
			setPending(false);
		}
	};

	if (editing) {
		return (
			<div className="flex flex-col gap-2">
				<Textarea
					value={draft}
					placeholder={t("issues.descriptionPlaceholder")}
					onChange={(e) => setDraft(e.target.value)}
					rows={8}
					maxLength={20000}
				/>
				<div className="flex items-center gap-2">
					<Button size="sm" disabled={pending} onClick={save}>
						{pending && <Loader2 className="animate-spin" />}
						{t("common.save")}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={pending}
						onClick={() => setEditing(false)}
					>
						{t("common.cancel")}
					</Button>
				</div>
			</div>
		);
	}

	if (!description) {
		return (
			<Button
				variant="ghost"
				className="text-muted-foreground hover:text-foreground min-h-16 h-auto w-full justify-start rounded-md border border-dashed p-3 text-left text-sm font-normal"
				disabled={disabled}
				onClick={() => setEditing(true)}
			>
				{t("issues.descriptionEmpty")}
			</Button>
		);
	}

	return (
		<div className="group relative rounded-md">
			<div className="pr-8">
				<MarkdownContent>{description}</MarkdownContent>
			</div>
			{!disabled && (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("common.edit")}
					className="text-muted-foreground hover:text-foreground absolute top-0 right-0 opacity-0 transition-opacity group-hover:opacity-100"
					onClick={() => setEditing(true)}
				>
					<Pencil />
				</Button>
			)}
		</div>
	);
}
