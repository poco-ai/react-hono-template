import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { changeLanguage, type Language, SUPPORTED_LANGUAGES } from "@/i18n";

const LANGUAGE_LABELS: Record<Language, string> = {
	en: "English",
	zh: "中文",
};

export function LanguageSwitcher() {
	const { t, i18n } = useTranslation();

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
						<Check
							className={cn(
								"size-4",
								i18n.language === language ? "opacity-100" : "opacity-0",
							)}
						/>
						<span className="min-w-0 truncate">
							{LANGUAGE_LABELS[language]}
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
