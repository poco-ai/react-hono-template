import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import zh from "./locales/zh";

export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "lang";

function detectLanguage(): Language {
	const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
	if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
		return stored as Language;
	}
	return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
	resources: {
		en: { translation: en },
		zh: { translation: zh },
	},
	lng: detectLanguage(),
	fallbackLng: "en",
	interpolation: { escapeValue: false },
});

export function changeLanguage(language: Language) {
	void i18n.changeLanguage(language);
	localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
	document.documentElement.lang = language;
}

declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "translation";
		resources: {
			translation: typeof en;
		};
	}
}
