import { ATTACHMENT_CONTENT_TYPES } from "@workspace/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveContentType } from "@/features/attachments/data";

export interface CommentDraftFile {
	id: string;
	file: File;
	error?: string;
}

/**
 * Draft attachments for the comment composer: picks files, validates type and
 * size, tracks the latest upload abort controller and clears on successful
 * submit. The caller decides when to clear (only after a successful post), so
 * a failed post keeps the selection for a retry.
 */
export function useAttachmentDraft({ maxSize }: { maxSize: number }) {
	const { t } = useTranslation();
	const [selected, setSelected] = useState<CommentDraftFile[]>([]);
	const abortRef = useRef<AbortController | null>(null);

	// Abort in-flight uploads if the issue page unmounts mid-post.
	useEffect(() => {
		return () => abortRef.current?.abort();
	}, []);

	const addFiles = (list: FileList | File[]) => {
		const next: CommentDraftFile[] = [];
		for (const file of Array.from(list)) {
			const contentType = resolveContentType(file);
			let error: string | undefined;
			if (
				!(ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(contentType)
			) {
				error = t("attachments.typeNotAllowed", { filename: file.name });
			} else if (file.size < 1 || file.size > maxSize) {
				error = t("attachments.tooLarge", { filename: file.name });
			}
			next.push({ id: crypto.randomUUID(), file, error });
		}
		setSelected((prev) => [...prev, ...next]);
	};

	const removeFile = (id: string) => {
		setSelected((prev) => prev.filter((file) => file.id !== id));
	};

	const clear = () => setSelected([]);

	const files = useMemo(
		() => selected.filter((item) => !item.error).map((item) => item.file),
		[selected],
	);

	/** Abort signal for the next post; a newer post aborts the previous one. */
	const newSignal = () => {
		const controller = new AbortController();
		abortRef.current = controller;
		return controller.signal;
	};

	return { selected, files, addFiles, removeFile, clear, newSignal };
}

export type CommentAttachmentDraft = ReturnType<typeof useAttachmentDraft>;
