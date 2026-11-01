"use client";
import { useT } from "@/hooks/i18n/useT";
import { useId } from "react";
import type { Role } from "@/lib/auth/types";
import type { NavDestinationId } from "@/lib/navigation/catalogo";
import {
  destinosDaInterface,
  interfaceTemDestino,
  lerInterface,
  type InterfaceSettings,
} from "@/lib/navigation/interface";
import { menuEditavelDoPapel, type GrupoProjetado } from "@/lib/navigation/menu";

export function InterfaceEditor({
  value,
  onChange,
  role,
  disabled = false,
}: {
  value: InterfaceSettings;
  onChange: (value: InterfaceSettings) => void;
  role: Role;
  disabled?: boolean;
}) {
  const t = useT();
  const id = useId();
  const selected = new Set<string>(
    value.destinos ?? destinosDaInterface(value, false, role).map((d) => d.href),
  );
  // As opções são o menu novo (bloco › área › grupo, nomes novos) sem as portas
  // essenciais, que nunca se escondem: a mesma projeção do catálogo que desenha o menu.
  const blocos = menuEditavelDoPapel(role);
  const options = blocos.flatMap((b) =>
    (b.id === "configurar" ? b.areas.flatMap((a) => a.grupos) : b.grupos).flatMap((g) => g.itens),
  );

  function grupo(g: GrupoProjetado) {
    return (
      <fieldset key={g.id} className="space-y-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">{t(g.label)}</legend>
        {g.itens.map((d) => (
          <label key={d.href} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(d.href)}
              onChange={(e) => {
                const next = new Set(
                  options.filter((option) => selected.has(option.href)).map((option) => option.href),
                );
                if (e.target.checked) next.add(d.href);
                else next.delete(d.href);
                onChange({
                  preset: value.preset,
                  destinos: [...next] as NavDestinationId[],
                });
              }}
              className="mt-1"
            />
            <span>
              {t(d.label)}
              {d.menu.termo ? (
                <span className="block text-[11px] leading-tight text-muted-foreground">{t(d.menu.termo)}</span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-md border p-4">
      <legend className="px-1 text-sm font-medium">{t("Interface")}</legend>
      <p className="text-xs text-muted-foreground">{t("Define quais áreas aparecem na navegação. As permissões continuam sendo determinadas pelo papel. Links de conversas e avisos podem abrir áreas autorizadas que estejam ocultas.")}</p>
      <label htmlFor={id} className="block text-sm">{t("Perfil de interface")}</label>
      <select
        id={id}
        value={value.preset}
        onChange={(e) => onChange({ preset: e.target.value as InterfaceSettings["preset"] })}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="completa">{t("Completa")}</option>
        <option value="simplificada">{t("Simplificada")}</option>
      </select>
      <p className="text-xs text-muted-foreground">{t("Trocar o perfil restaura sua seleção padrão. Perfil, segurança e acesso à equipe de quem administra continuam disponíveis.")}</p>
      {lerInterface(value).needsAdjustment && (
        <p role="status" className="text-sm">{t("A seleção contém áreas antigas. Confira e salve novamente.")}</p>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {t("Personalizar áreas visíveis")}{value.destinos ? t(" (personalizada)") : ""}
        </summary>
        <div className="mt-3 max-h-96 space-y-5 overflow-y-auto">
          {blocos.map((b) => (
            <section key={b.id} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">{t(b.label)}</h3>
              {b.id === "configurar"
                ? b.areas.map((a) => (
                    <div key={a.id} className="space-y-2 border-l pl-3">
                      <h4 className="text-sm font-medium">{t(a.label)}</h4>
                      {a.grupos.map(grupo)}
                    </div>
                  ))
                : b.grupos.map(grupo)}
            </section>
          ))}
        </div>
      </details>
      {!interfaceTemDestino(value, role) || value.destinos?.length === 0 ? (
        <p role="alert" className="text-sm text-destructive">{t("Selecione ao menos uma área de trabalho permitida ao papel.")}</p>
      ) : null}
    </fieldset>
  );
}
