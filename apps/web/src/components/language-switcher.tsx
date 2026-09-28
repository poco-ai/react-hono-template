import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { changeLanguage, type Language, SUPPORTED_LANGUAGES } from "@/i18n";

const LANGUAGE_LABELS: Record<Language, string> = {
	en: "English",
	zh: "中文",
};

export function LanguageSwitcher() {
	const { t } = useTranslation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label={t("language.toggle")}
					>
						<Languages />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				{SUPPORTED_LANGUAGES.map((language) => (
					<DropdownMenuItem
						key={language}
						onClick={() => changeLanguage(language)}
					>
						{LANGUAGE_LABELS[language]}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
