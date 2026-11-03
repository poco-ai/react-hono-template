import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { changeLanguage, type Language, SUPPORTED_LANGUAGES } from "@/i18n";

const LANGUAGE_LABELS: Record<Language, string> = {
	en: "English",
	zh: "中文",
};

export function LanguageMenuItems() {
	const { i18n } = useTranslation();

	return (
		<DropdownMenuRadioGroup
			value={i18n.language}
			onValueChange={(value) => changeLanguage(value as Language)}
		>
			{SUPPORTED_LANGUAGES.map((language) => (
				<DropdownMenuRadioItem key={language} value={language}>
					<span className="min-w-0 truncate">{LANGUAGE_LABELS[language]}</span>
				</DropdownMenuRadioItem>
			))}
		</DropdownMenuRadioGroup>
	);
}

export function LanguageSwitcher() {
	const { t } = useTranslation();

	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger
					render={
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
					}
				/>
				<TooltipContent>{t("language.toggle")}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end">
				<LanguageMenuItems />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
