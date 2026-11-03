import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiErrorMessage } from "@/lib/errors";

export function MutationError({
	error,
	className,
}: {
	error: Error | null | undefined;
	className?: string;
}) {
	const { t } = useTranslation();

	if (!error) {
		return null;
	}

	return (
		<Alert variant="destructive" className={className}>
			<CircleAlert />
			<AlertDescription>{apiErrorMessage(t, error)}</AlertDescription>
		</Alert>
	);
}
