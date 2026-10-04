import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function SecretReveal({ value }: { value: string }) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		await navigator.clipboard.writeText(value);
		setCopied(true);
	};

	return (
		<div className="flex items-start gap-2">
			<code className="bg-muted max-h-32 min-w-0 flex-1 overflow-y-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap select-all">
				{value}
			</code>
			<Button
				type="button"
				variant="outline"
				className="shrink-0"
				onClick={copy}
			>
				{copied ? t("common.copied") : t("common.copy")}
			</Button>
		</div>
	);
}
