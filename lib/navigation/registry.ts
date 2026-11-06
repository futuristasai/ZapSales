import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { AgenteEmConversa, FunilEmEtapas, PassagemParaHumano } from "@/components/icons/produto";
import {
  Bell,
  BookOpen,
  Brain,
  Buildings,
  CalendarBlank,
  ChartBar,
  ChartLineUp,
  ClipboardText,
  ClockCountdown,
  ClockCounterClockwise,
  FileText,
  Flag,
  FlowArrow,
  Funnel,
  Gauge,
  Gear,
  Inbox,
  Kanban,
  Key,
  Lightbulb,
  ListChecks,
  Lock,
  Megaphone,
  Palette,
  PaperPlaneTilt,
  Phone,
  Plugs,
  PlugsConnected,
  PuzzlePiece,
  Receipt,
  Robot,
  ScalesSimple,
  ShieldCheck,
  Signpost,
  Storefront,
  Tag,
  UserCircle,
  Users,
  UsersThree,
  WebhooksLogo,
  AddressBook,
  Binoculars,
  Briefcase,
  CalendarCheck,
  ChartPieSlice,
  CreditCard,
  CurrencyCircleDollar,
  Database,
  Files,
  HandCoins,
  IdentificationCard,
  Lightning,
  ListMagnifyingGlass,
  MagicWand,
  PhoneTransfer,
  Pulse,
  Shuffle,
  Signature,
  Certificate,
  Sparkle,
  Target,
  ToggleRight,
  TrendUp,
  TreeStructure,
  UploadSimple,
  UserList,
  Wallet,
} from "@/lib/ui/icons";

import {
  NAV_CATALOG,
  PAGINAS_DE_AREA,
  type GrupoDoMenuId,
  type NavMetadata,
  type PaginaDeAreaHref,
} from "./catalogo";

const ICONS = {
  Bell,
  BookOpen,
  Brain,
  Buildings,
  CalendarBlank,
  ChartBar,
  ChartLineUp,
  ClipboardText,
  ClockCountdown,
  ClockCounterClockwise,
  FileText,
  Flag,
  FlowArrow,
  Funnel,
  Gauge,
  Gear,
  Inbox,
  Kanban,
  Key,
  Lightbulb,
  ListChecks,
  Lock,
  Megaphone,
  Palette,
  PaperPlaneTilt,
  Phone,
  Plugs,
  PlugsConnected,
  PuzzlePiece,
  Receipt,
  Robot,
  ScalesSimple,
  ShieldCheck,
  Signpost,
  Storefront,
  Tag,
  UserCircle,
  Users,
  UsersThree,
  AddressBook,
  Binoculars,
  Briefcase,
  CalendarCheck,
  ChartPieSlice,
  CreditCard,
  CurrencyCircleDollar,
  Database,
  Files,
  HandCoins,
  IdentificationCard,
  Lightning,
  ListMagnifyingGlass,
  MagicWand,
  PhoneTransfer,
  Pulse,
  Shuffle,
  Signature,
  Certificate,
  Sparkle,
  Target,
  ToggleRight,
  TrendUp,
  TreeStructure,
  UploadSimple,
  UserList,
  Wallet,
  WebhooksLogo,
  // ícones próprios do produto (components/icons/produto)
  AgenteEmConversa,
  FunilEmEtapas,
  PassagemParaHumano,
};
export interface NavDestination extends Omit<NavMetadata, "icon"> {
  icon: PhosphorIcon;
}
export const NAV_DESTINATIONS: NavDestination[] = NAV_CATALOG.map((d) => ({
  ...d,
  icon: ICONS[d.icon],
}));

/** Uma página de área (`/app/crm`…) com o ícone já resolvido — ver `PAGINAS_DE_AREA`. */
export interface PaginaDeArea {
  href: PaginaDeAreaHref;
  label: string;
  description: string;
  icon: PhosphorIcon;
  grupos: readonly GrupoDoMenuId[];
}
export const PAGINAS: readonly PaginaDeArea[] = PAGINAS_DE_AREA.map((p) => ({
  ...p,
  icon: ICONS[p.icon],
}));
/**
 * Único ponto de decisão de permissão da navegação.
 *
 * É o que dispensa os sete `usePermission()` que o Sidebar chamava em sequência
 * — hooks não rodam em laço condicional, então cada permissão exigia sua linha.
 * Como função pura, um `.filter()` resolve todas.
 */
export { canSee } from "./interface";
