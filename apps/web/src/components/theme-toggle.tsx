import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type Theme, useTheme } from "@/components/theme-provider";

const THEMES: Theme[] = ["light", "dark", "system"];

export function ThemeToggle() {
	const { t } = useTranslation();
	const { setTheme } = useTheme();

	return (
		<DropdownMenu>
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
			<DropdownMenuContent align="end">
				{THEMES.map((value) => (
					<DropdownMenuItem key={value} onClick={() => setTheme(value)}>
						{t(`theme.${value}`)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
