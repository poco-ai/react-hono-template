import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@workspace/ui/globals.css";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { isClientError } from "@/lib/errors";
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
			<ThemeProvider>
				<QueryClientProvider client={queryClient}>
					<RouterProvider router={router} />
				</QueryClientProvider>
			</ThemeProvider>
		</StrictMode>,
	);
}
