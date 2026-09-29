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
			<code className="bg-muted min-w-0 flex-1 rounded-md border p-3 break-all font-mono text-xs select-all">
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
