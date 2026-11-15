import { z } from "zod";
import { i18n } from "@/i18n";

/**
 * Translates zod's built-in validation messages with the active language.
 *
 * Language cannot be resolved at module scope (the user can switch it at
 * runtime), so the map reads `i18n` on every parse. A schema-level message
 * (e.g. `.min(1, "...")` or a refinement) still wins over this map: zod only
 * calls the global error map for issues that carry no message.
 */
const translate = (key: string, options?: Record<string, unknown>): string =>
	(i18n.t as (key: string, options?: Record<string, unknown>) => string)(
		key,
		options,
	);

const isNumericOrigin = (origin: string) =>
	origin === "number" ||
	origin === "int" ||
	origin === "bigint" ||
	origin === "date";

z.config({
	customError: (issue) => {
		switch (issue.code) {
			case "invalid_type":
				return translate("form.errors.required");
			case "too_small": {
				const count = Number(issue.minimum);
				if (isNumericOrigin(issue.origin)) {
					return translate("form.errors.min", { count });
				}
				// Mirrors the previous form copy: an empty string/array is simply
				// "required", anything longer gets a length message.
				return count <= 1
					? translate("form.errors.required")
					: translate("form.errors.minLength", { count });
			}
			case "too_big": {
				const count = Number(issue.maximum);
				return issue.origin === "string"
					? translate("form.errors.maxLength", { count })
					: translate("form.errors.max", { count });
			}
			case "invalid_format":
				if (issue.format === "email") {
					return translate("form.errors.email");
				}
				if (issue.format === "url") {
					return translate("form.errors.url");
				}
				return translate("form.errors.invalidFormat");
			case "invalid_value":
				return translate("form.errors.invalidValue");
			case "not_multiple_of":
				return translate("form.errors.invalidNumber");
			case "invalid_union":
			case "unrecognized_keys":
				return translate("form.errors.invalidValue");
			case "custom":
				return translate("form.errors.invalidValue");
			default:
				return translate("form.errors.required");
		}
	},
});
