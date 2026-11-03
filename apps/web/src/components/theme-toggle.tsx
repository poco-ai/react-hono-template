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
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type Theme, useTheme } from "@/components/theme-provider";

const THEMES: Theme[] = ["light", "dark", "system"];

export function ThemeMenuItems() {
	const { t } = useTranslation();
	const { theme, setTheme } = useTheme();

	return (
		<DropdownMenuRadioGroup
			value={theme}
			onValueChange={(value) => setTheme(value as Theme)}
		>
			{THEMES.map((value) => (
				<DropdownMenuRadioItem key={value} value={value}>
					<span className="min-w-0 truncate">{t(`theme.${value}`)}</span>
				</DropdownMenuRadioItem>
			))}
		</DropdownMenuRadioGroup>
	);
}

export function ThemeToggle() {
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
									className="relative"
									aria-label={t("theme.toggle")}
								>
									<Sun className="dark:-rotate-90 dark:scale-0 transition-all" />
									<Moon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
								</Button>
							}
						/>
					}
				/>
				<TooltipContent>{t("theme.toggle")}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end">
				<ThemeMenuItems />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
