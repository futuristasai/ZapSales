import type { ComponentType } from "react";

import { Brain, ChatsCircle, Kanban, Storefront, UsersThree, WhatsappLogo } from "@/lib/ui/icons";

type Icone = ComponentType<{
  size?: number;
  weight?: "fill" | "bold" | "duotone" | "regular";
  className?: string;
  "aria-hidden"?: boolean;
}>;

/**
 * Um ícone por passo — o mesmo na trilha e no cabeçalho do passo, para a pessoa reconhecer o lugar
 * em que está sem ler. Phosphor, pelo ponto único `lib/ui/icons`.
 */
export const ICONE_DO_PASSO: Readonly<Record<string, Icone>> = {
  welcome: Storefront as Icone,
  "connect-whatsapp": WhatsappLogo as Icone,
  "setup-ai": Brain as Icone,
  funil: Kanban as Icone,
  testar: ChatsCircle as Icone,
  "invite-team": UsersThree as Icone,
};
