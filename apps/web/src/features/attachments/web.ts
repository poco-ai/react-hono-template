import type { WebFeatureDecl } from "@/features/web-types";

/** Attachments contribute UI inside issues/comments; they own `attachments` strings. */
export const attachmentsWeb: WebFeatureDecl = {
	id: "attachments",
	i18nNamespaces: ["attachments"],
};
