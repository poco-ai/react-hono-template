import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@workspace/ui/globals.css";
// Installs the zod error map before any form schema runs; must load with i18n.
import "@/lib/zod-i18n";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { isClientError } from "@/lib/errors";
import { HOTKEY_DEFAULTS } from "@/lib/hotkeys";
import { createAppRouter } from "./router.tsx";
import "./i18n";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: (failureCount, error) => !isClientError(error) && failureCount < 3,
		},
	},
});
const router = createAppRouter(queryClient);
const rootElement = document.getElementById("root");

if (rootElement) {
	createRoot(rootElement).render(
		<StrictMode>
			<HotkeysProvider defaultOptions={HOTKEY_DEFAULTS}>
				<ThemeProvider>
					<QueryClientProvider client={queryClient}>
						<RouterProvider router={router} />
					</QueryClientProvider>
				</ThemeProvider>
			</HotkeysProvider>
		</StrictMode>,
	);
}
