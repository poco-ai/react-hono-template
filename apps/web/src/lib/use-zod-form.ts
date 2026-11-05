import { revalidateLogic, useForm, useStore } from "@tanstack/react-form";
import type { TFunction } from "i18next";
import { type FormEvent, useCallback, useMemo } from "react";
import { ZodError, type ZodType } from "zod";
import {
	type FieldErrors,
	fieldErrorsFromZod,
	focusFirstInvalidField,
} from "./form";

export type UseZodFormOptions<
	TValues extends Record<string, unknown>,
	TResult,
> = {
	/** Initial form values; also the shape used by `form.Field` names. */
	defaultValues: TValues;
	/**
	 * Validation schema. Its output is what `onSubmit` receives, so wrap the
	 * shared schema with `z.preprocess(...)` when the form values need
	 * normalizing (trimming, date parsing, sentinel ids, ...).
	 */
	schema: ZodType<TResult>;
	onSubmit: (values: TResult) => void | Promise<void>;
	t: TFunction;
	/** Field name → i18n key overriding the generic error copy. */
	patternKeys?: Record<string, string>;
	/** Field name → DOM id used to focus the first invalid control. */
	inputIds?: Record<string, string>;
};

/**
 * Thin TanStack Form wrapper for the dialog forms that used to hand-roll
 * `useState` + `fieldErrors` + `withoutFieldError`.
 *
 * Validation only runs on submit. After the first submission `revalidateLogic`
 * switches to change events, but because there is no `onDynamic` validator the
 * schema is not re-run: any change merely clears the current form-level submit
 * error, so all inline field errors disappear together. The next submit
 * validates every field again.
 */
export function useZodForm<
	TValues extends Record<string, unknown>,
	TResult = TValues,
>({
	defaultValues,
	schema,
	onSubmit,
	t,
	patternKeys,
	inputIds,
}: UseZodFormOptions<TValues, TResult>) {
	// `schema.safeParse` runs the caller's `z.preprocess`, which can throw (e.g.
	// a TypeError on non-object input) before zod reports a validation issue.
	// Convert that into a form-level ZodError so it flows through the regular
	// error UI instead of becoming an unhandled rejection.
	const parseSafely = (
		value: TValues,
	): { success: true; data: TResult } | { success: false; error: ZodError } => {
		try {
			return schema.safeParse(value);
		} catch (error) {
			return {
				success: false,
				error: new ZodError([
					{
						code: "custom",
						message: error instanceof Error ? error.message : String(error),
						path: [],
					},
				]),
			};
		}
	};

	const form = useForm({
		defaultValues,
		validationLogic: revalidateLogic({ mode: "submit" }),
		validators: {
			// Run the schema through `parseSafely` (instead of passing the schema
			// object directly) so `errorMap.onSubmit` holds the raw `ZodError`
			// that `fieldErrorsFromZod` knows how to translate.
			onSubmit: ({ value }) => {
				const parsed = parseSafely(value);
				return parsed.success ? undefined : parsed.error;
			},
		},
		// TanStack Form does not hand the validation output to `onSubmit`, so the
		// value is parsed twice on submit: once by the validator above and once
		// here to get the typed `parsed.data`. Parsing is cheap and synchronous,
		// and reusing the validator's output would require extra state, so the
		// second parse is the intended trade-off.
		onSubmit: ({ value }) => {
			const parsed = parseSafely(value);
			if (!parsed.success) {
				return;
			}
			return onSubmit(parsed.data);
		},
	});

	// Subscribe to the submit error so the component re-renders when it is set
	// or cleared; reading `form.state` directly in render would not.
	const submitError = useStore(form.store, (state) => state.errorMap.onSubmit);

	const fieldErrors: FieldErrors = useMemo(() => {
		if (!(submitError instanceof ZodError)) {
			return {};
		}
		return fieldErrorsFromZod(submitError, t, patternKeys);
	}, [submitError, t, patternKeys]);

	const handleSubmit = useCallback(
		async (event?: FormEvent<HTMLFormElement>) => {
			event?.preventDefault();
			try {
				await form.handleSubmit();
			} catch {
				// The calling feature owns mutation error UI; this catch only stops
				// a rejected submit from surfacing as an unhandled rejection.
			}
			// Focus the first invalid control whether validation failed, passed,
			// or the submit threw; `errorMap.onSubmit` is the single source here.
			const error = form.state.errorMap.onSubmit;
			if (error instanceof ZodError) {
				focusFirstInvalidField(
					fieldErrorsFromZod(error, t, patternKeys),
					inputIds ?? {},
				);
			}
		},
		[form, t, patternKeys, inputIds],
	);

	const reset = useCallback(
		(values?: TValues) => {
			// `form.reset(values)` would also replace `defaultValues`. The next
			// render passes the original defaults back to `useForm`; because
			// `reset` clears `isTouched`, form-core's update would then restore
			// those defaults and wipe the entity values just loaded into the
			// dialog. Keep the initial defaults untouched.
			form.reset(values, { keepDefaultValues: true });
		},
		[form],
	);

	return { form, fieldErrors, handleSubmit, reset };
}
