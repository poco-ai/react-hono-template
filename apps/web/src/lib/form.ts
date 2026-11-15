import type { TFunction } from "i18next";
import type { ZodError } from "zod";

export type FieldErrors = Record<string, string>;

export function fieldErrorsFromZod(
	error: ZodError,
	t: TFunction,
	patternKeys: Record<string, string> = {},
): FieldErrors {
	const translate = t as (
		key: string,
		options?: Record<string, unknown>,
	) => string;
	const errors: FieldErrors = {};
	for (const issue of error.issues) {
		const field = String(issue.path[0] ?? "");
		if (!field || errors[field] !== undefined) {
			continue;
		}
		// `lib/zod-i18n.ts` translates the default messages at parse time, so the
		// issue message is already localized. `patternKeys` still wins for fields
		// whose copy is more specific than the generic zod wording (regex hints,
		// feature-specific limits).
		const patternKey = patternKeys[field];
		errors[field] = patternKey
			? translate(patternKey)
			: issue.message || translate("form.errors.required");
	}
	return errors;
}

export function focusFirstInvalidField(
	errors: FieldErrors,
	inputIds: Record<string, string>,
): void {
	for (const field of Object.keys(errors)) {
		const id = inputIds[field];
		if (!id) {
			continue;
		}
		const element = document.getElementById(id);
		if (element instanceof HTMLElement) {
			element.focus();
			return;
		}
	}
}
