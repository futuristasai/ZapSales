/* Motor compartilhado dos protótipos: estado, filtro por papel, peças de menu, busca, folha de celular, conteúdo de exemplo.
   Cada protótipo só decide COMO o menu é desenhado (função montar). */
(function () {
  const Dd = window.ZS_DADOS, ICON = window.ZS_ICONES;
  const CHAVE = "zs-proto-menu-v3";
  const PADRAO = { papel: "admin", tema: "claro", recursos: false, etiqueta: "embaixo", sub: "c", aparelho: "desktop", fixados: ["/ai/runs"], atual: "/inbox" };
  let estado = Object.assign({}, PADRAO);
  let salvoAparelho = false;
  try { const s = JSON.parse(localStorage.getItem(CHAVE) || "{}"); salvoAparelho = !!s.aparelho; Object.assign(estado, s); } catch { /* armazenamento bloqueado: segue com o padrão */ }
  if (!salvoAparelho && window.innerWidth < 760) estado.aparelho = "mobile"; // num celular de verdade, começa no layout de celular
  const ouvintes = new Set();

  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const f of filhos.flat(Infinity)) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(f));
    return el;
  }
  function ic(nome, peso, tam) {
    const d = ICON[nome] || ICON.Question;
    const el = h("span", { class: "zs-ic", "aria-hidden": "true", html: `<svg viewBox="0 0 256 256" fill="currentColor">${(d[peso || "regular"] || d.regular)}</svg>` });
    if (tam) { el.style.width = el.style.height = tam + "px"; el.firstChild.style.width = el.firstChild.style.height = tam + "px"; }
    return el;
  }
  const marca = () => h("span", { class: "zs-logo", html: `<svg viewBox="0 0 216 216" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M60 26H156A34 34 0 0 1 190 60V132A34 34 0 0 1 156 166H72L26 198V60A34 34 0 0 1 60 26ZM66 52A14 14 0 0 0 52 66V126A14 14 0 0 0 66 140H150A14 14 0 0 0 164 126V66A14 14 0 0 0 150 52Z"/><path fill="currentColor" d="M118 60L78 106H104L94 136L140 86H114L126 60Z"/></svg><span>ZapSales</span>` });

  function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* sem armazenamento: vale só nesta sessão */ } }
  function set(patch) { Object.assign(estado, patch); salvar(); ouvintes.forEach((f) => f()); }

  /* ───────── consultas ───────── */
  const papel = () => Dd.PAPEIS.find((p) => p.id === estado.papel);
  const ve = (d) => Dd.RANK[estado.papel] >= Dd.RANK[d.min] && (!d.opc || estado.recursos);
  const visiveis = () => Dd.DESTINOS.filter(ve);
  const porTema = (t) => Dd.DESTINOS.filter((d) => d.tema === t && ve(d));
  const temasDe = (b) => Dd.TEMAS.filter((t) => t.bloco === b);
  const porBloco = (b) => Dd.DESTINOS.filter((d) => d.bloco === b && ve(d));
  const fixados = () => estado.fixados.map((id) => Dd.DESTINOS.find((d) => d.id === id)).filter((d) => d && ve(d) && d.bloco !== "dia");
  const atual = () => Dd.DESTINOS.find((d) => d.id === estado.atual) || Dd.DESTINOS[0];
  const total = (ids) => ids.reduce((s, d) => s + (d.n ? Dd.CONTADORES[d.n] || 0 : 0), 0);
  const caminho = (d) => {
    const t = Dd.TEMAS.find((x) => x.id === d.tema), b = Dd.BLOCOS.find((x) => x.id === d.bloco);
    return d.bloco === "voce" ? ["Você (menu da conta)", d.rot] : d.bloco === "dia" ? ["Todo dia", d.rot] : [b.rot, t.rot, d.rot];
  };

  /* ───────── peças ───────── */
  function ir(id) { estado.atual = id; fecharTudo(); salvar(); ouvintes.forEach((f) => f()); }
  function tituloDe(d) { return d.rot + (d.tec ? " — termo técnico: " + d.tec : "") + " · " + d.desc; }

  /* item de menu. opts: pin (mostra alfinete), compacto (só ícone), desc (mostra descrição), peso */
  function item(d, opts) {
    opts = opts || {};
    const ativo = d.id === estado.atual;
    const fim = h("span", { class: "zs-fim" });
    if (d.n && Dd.CONTADORES[d.n]) fim.append(h("span", { class: "zs-n", "aria-label": Dd.CONTADORES[d.n] + " pendentes" }, Dd.CONTADORES[d.n]));
    if (d.saude) fim.append(h("span", { class: "zs-saude " + (d.saude === "alerta" ? "alerta" : ""), role: "img", "aria-label": d.saude === "alerta" ? "1 número desconectado" : "conectado" }));
    if (d.opc && opts.opc !== false) fim.append(h("span", { class: "zs-opc" }, "opcional"));
    if (opts.pin && d.bloco !== "dia") {
      const fx = estado.fixados.includes(d.id);
      fim.append(h("button", { class: "zs-pin", type: "button", "aria-pressed": String(fx), "aria-label": (fx ? "Tirar de" : "Fixar em") + " Todo dia: " + d.rot, title: fx ? "Tirar de Todo dia" : "Fixar em Todo dia",
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); set({ fixados: fx ? estado.fixados.filter((x) => x !== d.id) : estado.fixados.concat(d.id) }); } }, ic("PushPin", fx ? "fill" : "regular")));
    }
    const l1 = [h("span", { class: "zs-rot" }, d.rot), d.tec ? h("span", { class: "zs-tec" }, d.tec) : null];
    const txt = h("span", { class: "zs-txt" + (opts.desc ? " col" : "") }, opts.desc ? h("span", { class: "zs-l1" }, l1) : l1);
    const a = h("a", { class: "zs-item" + (d.tec ? " tem-tec" : ""), href: "#" + d.id, title: tituloDe(d), "aria-current": ativo ? "page" : null,
      onclick: (e) => { e.preventDefault(); ir(d.id); } },
      opts.compacto ? null : null, ic(d.ic, ativo ? "fill" : "regular"), txt, fim);
    if (opts.desc) { txt.append(h("span", { class: "zs-desc" }, d.desc)); a.style.alignItems = "flex-start"; }
    return a;
  }
  const lista = (ds, opts) => ds.map((d) => item(d, opts));

  /* Junta tema + título + itens (blocos de submenu) */
  function secao(tema, opts) {
    const ds = porTema(tema.id);
    if (!ds.length) return null;
    return h("div", { class: "zs-sec" }, h("div", { class: "zs-sub" }, tema.rot), lista(ds, opts));
  }

  /* ───────── busca (⌘K) ───────── */
  let busca, buscaIn, buscaRes;
  function montarBusca() {
    buscaIn = h("input", { type: "search", placeholder: "Buscar uma tela — pelo nome simples ou pelo termo técnico (ex.: webhook)", "aria-label": "Buscar uma tela", oninput: preencherBusca,
      onkeydown: (e) => { if (e.key === "Escape") fecharTudo(); if (e.key === "Enter") { const a = buscaRes.querySelector(".zs-item"); if (a) a.click(); } } });
    buscaRes = h("div", { class: "res", role: "listbox" });
    busca = h("div", { class: "zs-busca", onclick: (e) => { if (e.target === busca) fecharTudo(); } }, h("div", { class: "caixa" }, buscaIn, buscaRes));
  }
  function norm(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function preencherBusca() {
    const q = norm(buscaIn.value);
    const ds = visiveis().filter((d) => !q || norm([d.rot, d.antes, d.tec, d.desc].join(" ")).includes(q)).slice(0, 12);
    buscaRes.replaceChildren(...(ds.length ? ds.map((d) => { const a = item(d, { opc: false }); a.title = "Onde fica: " + caminho(d).join(" › "); a.append(h("span", { style: "font-size:12px;color:var(--color-subtle);white-space:nowrap" }, caminho(d).slice(0, -1).join(" › "))); return a; }) : [h("div", { class: "zs-vazio" }, "Nada encontrado para “" + buscaIn.value + "”.")]));
  }
  function abrirBusca() { busca.classList.add("on"); buscaIn.value = ""; preencherBusca(); setTimeout(() => buscaIn.focus(), 0); }
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); abrirBusca(); } });
  const botaoBusca = (curto) => h("button", { class: "zs-busca-btn", type: "button", onclick: abrirBusca, "aria-label": "Buscar uma tela" }, ic("MagnifyingGlass"), curto ? null : h("span", null, "Buscar uma tela"), curto ? null : h("kbd", null, "Ctrl K"));

  /* ───────── folha (celular) ───────── */
  let folhaFundo, folha, folhaCorpo;
  function montarFolha() {
    folhaCorpo = h("div", { class: "corpo", "data-scroll": "folha" });
    folha = h("div", { class: "zs-folha", role: "dialog", "aria-modal": "true", "aria-label": "Menu" }, h("div", { class: "puxador" }), folhaCorpo);
    folhaFundo = h("div", { class: "zs-folha-fundo", onclick: fecharTudo });
  }
  function abrirFolha(...nodes) { folhaCorpo.replaceChildren(...nodes); folhaFundo.classList.add("on"); folha.classList.add("on"); }
  function fecharTudo() {
    if (folhaFundo) folhaFundo.classList.remove("on");
    if (folha) folha.classList.remove("on");
    if (busca) busca.classList.remove("on");
    document.dispatchEvent(new CustomEvent("zs-fechar"));
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharTudo(); });

  /* ───────── conteúdo de exemplo ───────── */
  function inbox() {
    const q = { ia: ["IA atendendo", "ia"], humano: ["Em atendimento: Camila", "humano"], fila: ["Na fila", "fila"] };
    const lst = h("section", { class: "zs-lista", "aria-label": "Conversas" },
      h("header", null, h("h2", null, "Conversas"), h("div", { class: "zs-abas" }, h("span", { class: "on" }, "Fila " + Dd.CONTADORES.fila), h("span", null, "Minhas"), h("span", null, "Todas"), h("span", null, "Automático"))),
      h("div", { class: "zs-conversas", "data-scroll": "conversas" }, Dd.CONVERSAS.map((c, i) => h("div", { class: "zs-conv" + (i === 0 ? " on" : "") }, h("div", { class: "zs-av" }, c.i),
        h("div", { style: "min-width:0;flex:1" }, h("div", { class: "t" }, h("span", { class: "nome" }, c.n), h("span", { class: "hora" }, c.h)), h("div", { class: "previa" }, c.p),
          h("div", { class: "meta" }, h("span", { class: "zs-selo " + q[c.q][1] }, q[c.q][0]), h("span", { style: "font-size:12px;color:var(--color-subtle)" }, c.e)))))));
    const et = Dd.ETAPAS, at = 2;
    const linha = h("div", { style: "flex:1;min-width:260px;max-width:520px" }, h("div", { class: "zs-linha-funil" }, et.map((e, i) => [i ? h("u", { class: i > at ? "futura" : "" }) : null, h("i", { class: i === at ? "atual" : i > at ? "futura" : "" })])), h("div", { class: "zs-etapas" }, et.map((e) => h("span", null, e))));
    const conv = h("section", { class: "zs-conversa", "aria-label": "Conversa" },
      h("div", { class: "zs-jornada" }, h("div", { class: "zs-av" }, "CR"), h("div", null, h("div", { class: "quem" }, "Camila Rocha"), h("div", { style: "font-size:12.5px;color:var(--color-subtle)" }, "Studio Aurora · WhatsApp oficial")), linha, h("div", { style: "font-size:13px" }, h("b", null, "R$ 1.800"), h("div", { style: "color:var(--color-subtle);font-size:12px" }, "Próximo: enviar proposta"))),
      h("div", { class: "zs-comando" }, h("span", { class: "zs-selo ia" }, "IA atendendo"), "desde 14:02 · transferida por ninguém", h("span", { style: "margin-left:auto;display:flex;gap:8px" }, h("span", { class: "zs-chip-tec" }, "Transferir"), h("span", { class: "zs-chip-tec" }, "Fechar"))),
      h("div", { class: "zs-msgs", "data-scroll": "msgs" }, h("div", { class: "zs-m" }, "Oi! Queria remarcar minha sessão de quinta.", h("small", null, "14:30")), h("div", { class: "zs-m eu" }, "Claro, Camila! Tenho quinta às 15h ou às 16h30. Qual prefere?", h("small", null, "14:31 · IA")), h("div", { class: "zs-m" }, "Quero remarcar para quinta, pode ser às 15h?", h("small", null, "14:32"))),
      h("div", { class: "zs-compor" }, h("div", null, "Escreva uma mensagem…"), h("button", { type: "button" }, "Enviar")));
    return h("div", { class: "zs-inbox" }, lst, conv);
  }
  function stub(d) {
    const cam = caminho(d);
    const papelMin = { viewer: "Todos", agent: "Atendente e acima", manager: "Gerente e acima", admin: "Só o dono" }[d.min];
    return h("div", { class: "zs-pg" },
      h("h1", null, d.rot, d.tec ? h("span", { class: "zs-chip-tec", title: "O termo técnico aparece no título da tela, para quem chega pelo nome simples ou pelo técnico." }, d.tec) : null),
      h("p", { class: "zs-lede" }, d.desc),
      h("div", { class: "zs-painel", role: "table", "aria-label": "Onde esta tela fica" },
        h("div", { class: "linha" }, h("span", { class: "k" }, "Onde fica agora"), h("span", { class: "v zs-caminho" }, cam.map((c, i) => [i ? "›" : null, i === cam.length - 1 ? h("em", null, c) : c]))),
        h("div", { class: "linha" }, h("span", { class: "k" }, "Onde estava hoje"), h("span", { class: "v" }, d.hoje)),
        d.antes !== d.rot ? h("div", { class: "linha" }, h("span", { class: "k" }, "Nome hoje"), h("span", { class: "v" }, d.antes)) : null,
        h("div", { class: "linha" }, h("span", { class: "k" }, "Quem vê"), h("span", { class: "v" }, papelMin + (d.opc ? " · só se a empresa usa este recurso" : ""))),
        h("div", { class: "linha" }, h("span", { class: "k" }, "Endereço (não muda)"), h("span", { class: "v", style: "font-family:var(--mono);font-size:13px" }, d.href))),
      h("p", { class: "zs-nota" }, "Tela de exemplo do protótipo: no produto, a tela real abre aqui. O endereço e o que a tela faz não mudam — só o lugar no menu e o nome."));
  }
  function conteudo(extra) {
    const d = atual();
    const c = d.id === "/inbox" ? inbox() : h("div", { class: "zs-scroll", "data-scroll": "pg" }, stub(d));
    return h("main", { class: "zs-miolo" }, extra || null, c);
  }

  /* ───────── casca do protótipo ───────── */
  const PROTOS = [
    ["p1-mesa-de-trabalho.html", "1 · Mesa de trabalho"], ["p2-faixa-e-painel.html", "2 · Faixa + painel"], ["p3-barra-no-topo.html", "3 · Barra no topo"],
    ["p4-tres-modos.html", "4 · Três modos"], ["p5-dock-e-cartoes.html", "5 · Dock + cartões"], ["p6-faixa-e-mesa.html", "6 · Faixa + Mesa"],
  ];
  function seg(rot, chave, opcoes) {
    return h("div", { class: "grupo" }, h("span", null, rot), h("div", { class: "seg", role: "group", "aria-label": rot }, opcoes.map(([v, t]) => h("button", { type: "button", "aria-pressed": String(String(estado[chave]) === String(v)), onclick: () => set({ [chave]: v }) }, t))));
  }
  function iniciar(cfg) {
    montarBusca(); montarFolha();
    const raiz = document.body;
    const barra = h("header", { class: "zs-barra" });
    const aviso = h("div", { class: "zs-aviso", role: "button", tabindex: "0", title: "Clique para ler tudo", onclick: () => aviso.classList.toggle("aberto"), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aviso.classList.toggle("aberto"); } } },
      h("strong", null, "Protótipo " + cfg.titulo + ". "), cfg.ideia + " ", h("span", null, "Os 63 destinos são os reais do produto; contadores, nomes e conversas são dados de exemplo."));
    const palco = h("div", { class: "zs-palco" });
    const tela = h("div", { class: "zs-tela", id: "tela" });
    palco.append(tela);
    raiz.append(barra, aviso, palco);

    let barraAberta = false;
    function desenhar() {
      document.documentElement.dataset.theme = estado.tema === "escuro" ? "dark" : "light";
      palco.dataset.device = estado.aparelho;
      tela.dataset.etiqueta = estado.etiqueta;
      barra.classList.toggle("aberta", barraAberta);
      barra.replaceChildren(
        h("b", null, "Menu ZapSales"),
        (() => { const a = seg("Aparelho", "aparelho", [["desktop", "Computador"], ["mobile", "Celular"]]); a.classList.add("ap"); return a; })(),
        h("button", { class: "zs-opcoes", type: "button", "aria-expanded": String(barraAberta), onclick: () => { barraAberta = !barraAberta; desenhar(); } }, barraAberta ? "Fechar opções" : "Mais opções"),
        h("div", { class: "zs-grupos" },
          seg("Ver como", "papel", Dd.PAPEIS.map((p) => [p.id, p.nome])),
          seg("Tema", "tema", [["claro", "Claro"], ["escuro", "Escuro"]]),
          seg("Recursos opcionais", "recursos", [[false, "Desligados"], [true, "Ligados"]]),
          seg("Termo técnico", "etiqueta", [["lado", "Ao lado"], ["embaixo", "Embaixo"], ["dica", "Só na dica"]]),
          (cfg.extras || []).map((e) => seg(e.rot, e.chave, e.opcoes)),
          h("nav", { class: "nav-proto", "aria-label": "Protótipos" }, h("a", { href: "index.html" }, "Índice"), PROTOS.map(([u, t]) => h("a", { href: u, "aria-current": location.pathname.endsWith(u) ? "page" : null }, t)))));
      const guarda = {};
      tela.querySelectorAll("[data-scroll]").forEach((e) => (guarda[e.dataset.scroll] = e.scrollTop));
      tela.replaceChildren();
      cfg.montar(tela, api);
      tela.append(busca, folhaFundo, folha);
      tela.querySelectorAll("[data-scroll]").forEach((e) => { if (guarda[e.dataset.scroll] != null) e.scrollTop = guarda[e.dataset.scroll]; });
    }
    /* "Computador" tem de funcionar em qualquer janela: se ela for estreita (celular, janela pequena, tela com zoom), a tela
       de computador é montada em 1180 px e reduzida para caber, em vez de cair no layout de celular. */
    const LARGURA_MIN = 1180;
    function ajustarEscala() {
      tela.style.zoom = ""; tela.style.width = ""; tela.style.height = "";
      if (estado.aparelho !== "desktop") return;
      const cs = getComputedStyle(palco);
      const w = palco.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const alt = palco.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (w >= LARGURA_MIN) return;
      const z = w / LARGURA_MIN;
      tela.style.width = LARGURA_MIN + "px"; tela.style.height = Math.max(480, alt / z) + "px"; tela.style.zoom = String(z);
    }
    const desenharEEscalar = () => { desenhar(); ajustarEscala(); };
    ouvintes.add(desenharEEscalar);
    window.addEventListener("resize", ajustarEscala);
    desenharEEscalar();
  }

  const api = { h, ic, marca, estado: () => estado, set, papel, ve, visiveis, porTema, porBloco, temasDe, fixados, atual, total, caminho, item, lista, secao, ir, conteudo, abrirBusca, botaoBusca, abrirFolha, fecharTudo, iniciar, D: Dd };
  window.ZS = api;
})();
