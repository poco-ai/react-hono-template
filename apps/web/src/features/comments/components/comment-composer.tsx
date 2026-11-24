import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { Paperclip, X } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	MarkdownEditor,
	type MentionCandidate,
} from "@/components/markdown-editor";
import type { CommentAttachmentDraft } from "@/features/web-types";

export const COMMENT_ATTACHMENT_ACCEPT =
	".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.zip";

const COMMENT_MAX_LENGTH = 10000;

/**
 * Comment composer (markdown body, reply banner, draft attachments). Fully
 * controlled: the issue view owns the body/reply state and the post mutation,
 * the attachment draft comes from `useAttachmentDraft`.
 */
export function CommentComposer({
	body,
	onBodyChange,
	replyTo,
	onCancelReply,
	mentions,
	frozen,
	submitting,
	resetKey,
	focusRequest,
	draft,
	onSubmit,
}: {
	body: string;
	onBodyChange: (value: string) => void;
	replyTo: { id: string; name: string } | null;
	onCancelReply: () => void;
	mentions: MentionCandidate[];
	frozen: boolean;
	submitting: boolean;
	resetKey: number;
	focusRequest: number;
	draft: CommentAttachmentDraft;
	onSubmit: () => void;
}) {
	const { t } = useTranslation();
	const inputRef = useRef<HTMLInputElement>(null);

	const canSubmit = body.trim().length > 0 && body.length <= COMMENT_MAX_LENGTH;

	return (
		<MarkdownEditor
			value={body}
			onChange={onBodyChange}
			resetKey={resetKey}
			placeholder={
				replyTo
					? t("comments.replyPlaceholder", { name: replyTo.name })
					: t("comments.placeholder")
			}
			disabled={frozen}
			rows={4}
			maxLength={COMMENT_MAX_LENGTH}
			mentions={mentions}
			focusRequest={focusRequest}
			footer={
				<div className="flex flex-col gap-2 border-t px-3 py-2">
					{replyTo && (
						<div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
							<span className="truncate">
								{t("comments.replyingTo", { name: replyTo.name })}
							</span>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-label={t("comments.cancelReply")}
								onClick={onCancelReply}
							>
								<X />
							</Button>
						</div>
					)}
					{draft.selected.length > 0 && (
						<ul className="flex flex-col gap-1">
							{draft.selected.map((item) => (
								<li key={item.id} className="flex items-center gap-2 text-xs">
									<span
										className={
											item.error
												? "text-destructive min-w-0 flex-1 truncate"
												: "min-w-0 flex-1 truncate"
										}
									>
										{item.error ?? item.file.name}
									</span>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("comments.removeFile", {
											filename: item.file.name,
										})}
										onClick={() => draft.removeFile(item.id)}
									>
										<X />
									</Button>
								</li>
							))}
						</ul>
					)}
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t("comments.attach")}
								disabled={frozen || submitting}
								onClick={() => inputRef.current?.click()}
							>
								<Paperclip />
							</Button>
							<input
								ref={inputRef}
								type="file"
								multiple
								hidden
								accept={COMMENT_ATTACHMENT_ACCEPT}
								onChange={(event) => {
									if (event.target.files && event.target.files.length > 0) {
										draft.addFiles(event.target.files);
									}
									event.target.value = "";
								}}
							/>
							<span className="text-muted-foreground text-xs">
								{t("comments.charCount", {
									count: body.length,
									max: COMMENT_MAX_LENGTH,
								})}
							</span>
						</div>
						<Button
							size="sm"
							disabled={frozen || !canSubmit || submitting}
							onClick={onSubmit}
						>
							{submitting && <Spinner />}
							{replyTo ? t("comments.reply") : t("comments.post")}
						</Button>
					</div>
				</div>
			}
		/>
	);
}
