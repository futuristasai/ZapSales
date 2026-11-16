import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import type { IconeDoAdmin } from "@/lib/admin/catalogo";
import {
  ArrowCircleUp,
  Buildings,
  CalendarBlank,
  ChartBar,
  ChatsCircle,
  ClipboardText,
  EnvelopeSimple,
  Gauge,
  HardDrives,
  Lock,
  Palette,
  PuzzlePiece,
  Receipt,
  Scales,
  ShieldCheck,
  ToggleRight,
  TreeStructure,
  UserPlus,
  Users,
  Warning,
  WhatsappLogo,
} from "@/lib/ui/icons";

/**
 * O desenho de cada nome de ícone do catálogo do admin (`lib/admin/catalogo.ts`).
 * `Record` exaustivo: nome novo no catálogo sem desenho aqui não compila.
 */
export const ICONES_DO_ADMIN: Record<IconeDoAdmin, PhosphorIcon> = {
  Gauge,
  Buildings,
  Users,
  ShieldCheck,
  ChatsCircle,
  ClipboardText,
  Scales,
  Warning,
  ChartBar,
  Palette,
  UserPlus,
  EnvelopeSimple,
  Lock,
  ToggleRight,
  PuzzlePiece,
  WhatsappLogo,
  Receipt,
  CalendarBlank,
  TreeStructure,
  HardDrives,
  ArrowCircleUp,
};
