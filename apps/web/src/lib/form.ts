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
		switch (issue.code) {
			case "invalid_format":
				errors[field] =
					issue.format === "email"
						? translate("form.errors.email")
						: patternKeys[field]
							? translate(patternKeys[field])
							: translate("form.errors.required");
				break;
			case "too_small":
				errors[field] = patternKeys[field]
					? translate(patternKeys[field])
					: field === "password"
						? translate("form.errors.passwordMin", {
								count: Number(issue.minimum),
							})
						: translate("form.errors.required");
				break;
			case "too_big":
				errors[field] = patternKeys[field]
					? translate(patternKeys[field])
					: translate("form.errors.maxLength", {
							count: Number(issue.maximum),
						});
				break;
			default:
				errors[field] = patternKeys[field]
					? translate(patternKeys[field])
					: translate("form.errors.required");
				break;
		}
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

export function withoutFieldError(
	errors: FieldErrors,
	field: string,
): FieldErrors {
	if (!(field in errors)) {
		return errors;
	}
	const next = { ...errors };
	delete next[field];
	return next;
}
