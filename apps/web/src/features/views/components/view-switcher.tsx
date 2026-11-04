import type { IssueQuery } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import { Switch } from "@workspace/ui/components/switch";
import {
	Check,
	ChevronDown,
	ListFilter,
	Pencil,
	Share2,
	Star,
	StarOff,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MutationError } from "@/components/mutation-error";
import { QuotaError } from "@/components/quota-error";
import { apiErrorMessage } from "@/lib/errors";
import {
	useClearDefaultView,
	useCreateView,
	useDeleteView,
	useSetDefaultView,
	useUpdateView,
	type ViewDto,
} from "../data";

interface ViewSwitcherProps {
	orgId: string;
	projectId: string;
	views: ViewDto[];
	/** The view list is still loading; hide the empty state until it settles. */
	viewsLoading?: boolean;
	viewsError?: Error | null;
	onRetryViews?: () => void;
	currentView?: ViewDto;
	/** View the user started editing; kept after `viewId` leaves the URL. */
	dirtyView: ViewDto | null;
	query: IssueQuery;
	layout: "list" | "board";
	canManage: boolean;
	currentUserId?: string;
	onApply: (view: ViewDto) => void;
	onUpdated: (view: ViewDto) => void;
	onCleared: () => void;
}

type SaveForm = {
	name: string;
	shared: boolean;
	isDefault: boolean;
};

const EMPTY_FORM: SaveForm = { name: "", shared: false, isDefault: false };

export function ViewSwitcher({
	orgId,
	projectId,
	views,
	viewsLoading = false,
	viewsError = null,
	onRetryViews,
	currentView,
	dirtyView,
	query,
	layout,
	canManage,
	currentUserId,
	onApply,
	onUpdated,
	onCleared,
}: ViewSwitcherProps) {
	const { t } = useTranslation();
	const [saveOpen, setSaveOpen] = useState(false);
	const [renameOpen, setRenameOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [form, setForm] = useState<SaveForm>(EMPTY_FORM);
	const [renameName, setRenameName] = useState("");

	const create = useCreateView(orgId, {
		onSuccess: (view) => {
			setSaveOpen(false);
			setForm(EMPTY_FORM);
			onApply(view);
			toast.success(t("issues.views.created"));
		},
	});

	const editingView = dirtyView ?? currentView;

	const update = useUpdateView(orgId, editingView?.id ?? "", {
		onSuccess: (view) => {
			setRenameOpen(false);
			onUpdated(view);
			toast.success(t("issues.views.updated"));
		},
	});

	const rename = useUpdateView(orgId, currentView?.id ?? "", {
		onSuccess: () => {
			setRenameOpen(false);
			toast.success(t("issues.views.renamed"));
		},
	});

	const remove = useDeleteView(orgId, {
		onSuccess: () => {
			setDeleteOpen(false);
			onCleared();
			toast.success(t("issues.views.deleted"));
		},
	});

	const setDefault = useSetDefaultView(orgId, {
		onSuccess: () => toast.success(t("issues.views.defaultSet")),
	});

	const clearDefault = useClearDefaultView(orgId, {
		onSuccess: () => toast.success(t("issues.views.defaultCleared")),
	});

	const personal = views.filter((view) => view.ownerId === currentUserId);
	const shared = views.filter(
		(view) => view.ownerId !== currentUserId && view.shared,
	);
	const canMutateEditing = Boolean(
		editingView &&
			(editingView.ownerId === currentUserId ||
				(editingView.shared && canManage)),
	);
	const currentName =
		dirtyView?.name ?? currentView?.name ?? t("issues.views.title");
	const actionError =
		clearDefault.error ??
		setDefault.error ??
		remove.error ??
		rename.error ??
		update.error;

	const openSave = () => {
		setForm({
			name: currentView?.name ? `${currentView.name} 2` : "",
			shared: false,
			isDefault: views.length === 0,
		});
		create.reset();
		setSaveOpen(true);
	};

	const openRename = () => {
		if (!currentView) {
			return;
		}
		setRenameName(currentView.name);
		rename.reset();
		setRenameOpen(true);
	};

	const viewItem = (view: ViewDto) => (
		<DropdownMenuItem key={view.id} onClick={() => onApply(view)}>
			{view.isDefault && view.ownerId === currentUserId ? (
				<Star className="fill-current" />
			) : (
				<span className="size-4" />
			)}
			<span className="min-w-0 flex-1 truncate">{view.name}</span>
			{view.shared && <Share2 className="text-muted-foreground" />}
			{currentView?.id === view.id && <Check />}
		</DropdownMenuItem>
	);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="outline"
							size="sm"
							className="h-8 max-w-52 gap-1.5"
						/>
					}
				>
					<ListFilter className="size-4" />
					<span className="truncate">{currentName}</span>
					{dirtyView && (
						<span className="text-muted-foreground text-xs">
							{t("issues.views.unsaved")}
						</span>
					)}
					<ChevronDown className="text-muted-foreground size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
					<DropdownMenuItem onClick={onCleared}>
						{currentView ? <span className="size-4" /> : <Check />}
						<span className="min-w-0 flex-1 truncate">
							{t("issues.views.allIssues")}
						</span>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{viewsLoading ? (
						<div className="text-muted-foreground flex items-center gap-2 px-1.5 py-2 text-xs">
							<Spinner className="size-3.5" />
							{t("common.loading")}
						</div>
					) : viewsError ? (
						<div className="flex flex-col gap-2 px-1.5 py-2">
							<span className="text-destructive text-xs">
								{apiErrorMessage(t, viewsError)}
							</span>
							{onRetryViews && (
								<Button variant="outline" size="sm" onClick={onRetryViews}>
									{t("common.retry")}
								</Button>
							)}
						</div>
					) : (
						<>
							<DropdownMenuGroup>
								<DropdownMenuLabel>
									{t("issues.views.personal")}
								</DropdownMenuLabel>
								{personal.length > 0 ? (
									personal.map(viewItem)
								) : (
									<p className="text-muted-foreground px-1.5 py-1 text-xs">
										{t("issues.views.noPersonal")}
									</p>
								)}
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuLabel>
									{t("issues.views.shared")}
								</DropdownMenuLabel>
								{shared.length > 0 ? (
									shared.map(viewItem)
								) : (
									<p className="text-muted-foreground px-1.5 py-1 text-xs">
										{t("issues.views.noShared")}
									</p>
								)}
							</DropdownMenuGroup>
							{views.length === 0 && (
								<Empty className="border-0 p-2">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<ListFilter />
										</EmptyMedia>
										<EmptyTitle>{t("issues.views.empty")}</EmptyTitle>
										<EmptyDescription>
											{t("issues.views.emptyDescription")}
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							)}
						</>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={openSave}>
						<ListFilter />
						{t("issues.views.saveAs")}
					</DropdownMenuItem>
					{editingView && (
						<>
							{canMutateEditing && (
								<DropdownMenuItem
									onClick={() =>
										update.mutate({
											name: editingView.name,
											query,
											layout,
										})
									}
									disabled={update.isPending}
								>
									<Check />
									{t("issues.views.update", { name: editingView.name })}
								</DropdownMenuItem>
							)}
							{currentView && canMutateEditing && (
								<>
									<DropdownMenuItem onClick={openRename}>
										<Pencil />
										{t("issues.views.rename")}
									</DropdownMenuItem>
									{currentView.ownerId === currentUserId &&
										!currentView.isDefault && (
											<DropdownMenuItem
												onClick={() => setDefault.mutate(currentView.id)}
												disabled={setDefault.isPending}
											>
												<Star />
												{t("issues.views.setDefault")}
											</DropdownMenuItem>
										)}
									{currentView.ownerId === currentUserId &&
										currentView.isDefault && (
											<DropdownMenuItem
												onClick={() => clearDefault.mutate(currentView.id)}
												disabled={clearDefault.isPending}
											>
												<StarOff />
												{t("issues.views.clearDefault")}
											</DropdownMenuItem>
										)}
									<DropdownMenuItem
										variant="destructive"
										onClick={() => {
											remove.reset();
											setDeleteOpen(true);
										}}
									>
										<Trash2 />
										{t("issues.views.delete")}
									</DropdownMenuItem>
								</>
							)}
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<MutationError error={actionError} className="mt-2 w-full" />

			<Dialog open={saveOpen} onOpenChange={setSaveOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("issues.views.saveTitle")}</DialogTitle>
						<DialogDescription>
							{t("issues.views.saveDescription")}
						</DialogDescription>
					</DialogHeader>
					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (!form.name.trim()) {
								return;
							}
							create.mutate({
								name: form.name.trim(),
								projectId,
								shared: canManage ? form.shared : false,
								isDefault: form.isDefault,
								query,
								layout,
							});
						}}
					>
						<Field>
							<FieldLabel htmlFor="view-name">
								{t("issues.views.name")}
							</FieldLabel>
							<Input
								id="view-name"
								value={form.name}
								maxLength={100}
								placeholder={t("issues.views.namePlaceholder")}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										name: event.target.value,
									}))
								}
							/>
						</Field>
						{canManage && (
							<Field>
								<div className="flex items-center justify-between gap-3">
									<div>
										<FieldLabel htmlFor="view-shared">
											{t("issues.views.share")}
										</FieldLabel>
										<FieldDescription>
											{t("issues.views.shareDescription")}
										</FieldDescription>
									</div>
									<Switch
										id="view-shared"
										checked={form.shared}
										onCheckedChange={(checked) =>
											setForm((current) => ({
												...current,
												shared: checked,
											}))
										}
									/>
								</div>
							</Field>
						)}
						<Field>
							<div className="flex items-center justify-between gap-3">
								<div>
									<FieldLabel htmlFor="view-default">
										{t("issues.views.makeDefault")}
									</FieldLabel>
									<FieldDescription>
										{t("issues.views.makeDefaultDescription")}
									</FieldDescription>
								</div>
								<Switch
									id="view-default"
									checked={form.isDefault}
									onCheckedChange={(checked) =>
										setForm((current) => ({
											...current,
											isDefault: checked,
										}))
									}
								/>
							</div>
						</Field>
						<QuotaError
							error={create.error}
							orgId={orgId}
							canUpgrade={canManage}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setSaveOpen(false)}
							>
								{t("common.cancel")}
							</Button>
							<Button
								type="submit"
								disabled={!form.name.trim() || create.isPending}
							>
								{t("issues.views.save")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={renameOpen} onOpenChange={setRenameOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("issues.views.renameTitle")}</DialogTitle>
					</DialogHeader>
					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (currentView && renameName.trim()) {
								rename.mutate({ name: renameName.trim() });
							}
						}}
					>
						<Field>
							<FieldLabel htmlFor="view-rename">
								{t("issues.views.name")}
							</FieldLabel>
							<Input
								id="view-rename"
								value={renameName}
								maxLength={100}
								onChange={(event) => setRenameName(event.target.value)}
							/>
						</Field>
						<MutationError error={rename.error} />
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setRenameOpen(false)}
							>
								{t("common.cancel")}
							</Button>
							<Button
								type="submit"
								disabled={!renameName.trim() || rename.isPending}
							>
								{t("common.save")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title={t("issues.views.deleteTitle")}
				description={t("issues.views.deleteDescription", {
					name: currentView?.name ?? "",
				})}
				confirmLabel={t("issues.views.delete")}
				variant="destructive"
				pending={remove.isPending || !currentView}
				error={remove.error}
				onConfirm={() => currentView && remove.mutate(currentView.id)}
			/>
		</>
	);
}
