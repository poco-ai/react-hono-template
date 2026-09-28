import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { client, unwrap } from "@/lib/api";
import { projectKeyFromName } from "@/lib/issue-utils";

const KEY_PATTERN = /^[A-Z]{2,6}$/;
const DEFAULT_COLOR = "#6366f1";

export function CreateProjectDialog({
	orgId,
	open,
	onOpenChange,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [key, setKey] = useState("");
	const [keyTouched, setKeyTouched] = useState(false);
	const [description, setDescription] = useState("");
	const [color, setColor] = useState(DEFAULT_COLOR);

	useEffect(() => {
		if (open) {
			setName("");
			setKey("");
			setKeyTouched(false);
			setDescription("");
			setColor(DEFAULT_COLOR);
		}
	}, [open]);

	const createMutation = useMutation({
		mutationFn: () =>
			unwrap(
				client.api.orgs[":orgId"].projects.$post({
					param: { orgId },
					json: {
						name: name.trim(),
						key,
						description: description.trim() || undefined,
						color,
					},
				}),
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orgs", orgId, "projects"] });
			onOpenChange(false);
		},
	});

	const onNameChange = (next: string) => {
		setName(next);
		if (!keyTouched) {
			setKey(projectKeyFromName(next));
		}
	};

	const keyInvalid = key.length > 0 && !KEY_PATTERN.test(key);

	const onSubmit = () => {
		if (!name.trim() || !KEY_PATTERN.test(key)) {
			return;
		}
		createMutation.mutate();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("projects.createTitle")}</DialogTitle>
					<DialogDescription>
						{t("projects.createDescription")}
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="project-name">{t("common.name")}</Label>
						<Input
							id="project-name"
							value={name}
							placeholder={t("projects.namePlaceholder")}
							onChange={(e) => onNameChange(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="project-key">{t("projects.key")}</Label>
						<Input
							id="project-key"
							value={key}
							placeholder={t("projects.keyPlaceholder")}
							onChange={(e) => {
								setKeyTouched(true);
								setKey(
									e.target.value
										.toUpperCase()
										.replace(/[^A-Z]/g, "")
										.slice(0, 6),
								);
							}}
							className="w-28 font-mono uppercase"
						/>
						<p className="text-muted-foreground text-xs">
							{t("projects.keyHint")}
						</p>
						{keyInvalid && (
							<p className="text-destructive text-xs">
								{t("projects.keyInvalid")}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="project-description">
							{t("common.description")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</Label>
						<Textarea
							id="project-description"
							value={description}
							placeholder={t("projects.descriptionPlaceholder")}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="project-color">
							{t("projects.color")}
							<span className="text-muted-foreground">
								{" "}
								({t("common.optional")})
							</span>
						</Label>
						<Input
							id="project-color"
							type="color"
							value={color}
							onChange={(e) => setColor(e.target.value)}
							className="h-9 w-16 p-1"
						/>
					</div>
					{createMutation.isError && (
						<p className="text-destructive text-sm">
							{createMutation.error.message}
						</p>
					)}
					<DialogFooter>
						<Button type="submit" disabled={createMutation.isPending}>
							{t("common.create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
