import type { ComponentType } from "react";
import { AiChatPanel } from "@/features/ai/components/chat-panel";

/**
 * The AI chat panel mounted once by the org layout. Contributed through
 * `aiWeb.panels` so the shell keeps zero AI imports.
 */
export const AiChatPanelMount: ComponentType = () => <AiChatPanel />;
