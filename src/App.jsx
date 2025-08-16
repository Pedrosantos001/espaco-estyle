import React, { useMemo, useState } from "react";

// Loja Varejo – Checkout completo no site (sem WhatsApp)
// Integração prevista: SuperFrete (Correios) para cálculo + geração de rastreio via /api/checkout

// =========================
// Catálogo (adicione peso e dimensões para frete)
// =========================
const CATEGORIES = [
  { id: "fibras", name: "Fibras" },
  { id: "acessorios", name: "Acessórios" },
];

const SAMPLE_PRODUCTS = [
  {
    id: "p1",
    name: "Fibra Premium Ondulada 30cm",
    sku: "FIB-OND-30",
    category: "fibras",
    retail: 59.9,
    weight_g: 200,
    length_cm: 20,
    height_cm: 5,
    width_cm: 20,
    image:
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop",
    colors: ["Preto", "Castanho", "Loiro"],
  },
  {
    id: "p2",
    name: "Fibra Premium Lisa 40cm",
    sku: "FIB-LIS-40",
    category: "fibras",
    retail: 69.9,
    weight_g: 220,
    length_cm: 22,
    height_cm: 5,
    width_cm: 20,
    image:
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=1200&auto=format&fit=crop",
    colors: ["Preto", "Castanho"],
  },
  {
    id: "p3",
    name: "Escova Modeladora 5-em-1",
    sku: "ACS-ESC-5",
    category: "acessorios",
    retail: 129.0,
    weight_g: 600,
    length_cm: 30,
    height_cm: 8,
    width_cm: 15,
    image:
      "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop",
    colors: ["Preto"],
  },
  {
    id: "p4",
    name: "Touca de Cetim Dupla Face",
    sku: "ACS-TOC-DF",
    category: "acessorios",
    retail: 29.9,
    weight_g: 80,
    length_cm: 16,
    height_cm: 3,
    width_cm: 16,
    image:
      "https://images.unsplash.com/photo-1593031892436-7d34b8b10247?q=80&w=1200&auto=format&fit=crop",
    colors: ["Rosa", "Preta", "Roxa"],
  },
];

// =========================
// Helpers
// =========================
const BRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function classNames(...xs) { return xs.filter(Boolean).join(" "); }

const CEP_ORIGEM = "20770-280"; // CEP da loja (ajuste)

// =========================
// App
// =========================
export default function App() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState([]); // [{id, qty, color}]

  // Frete Correios (SuperFrete)
  const [cepCliente, setCepCliente] = useState("");
  const [freteLoading, setFreteLoading] = useState(false);
  const [freteOpcoes, setFreteOpcoes] = useState([]);
  const [freteSelecionado, setFreteSelecionado] = useState(null);

  // Dados do cliente (checkout)
  const [cliente, setCliente] = useState({
    nome: "",
    email: "",
    cpf: "",
    telefone: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
  });

  // Produtos filtrados
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SAMPLE_PRODUCTS.filter((p) => {
      const byCat = cat === "all" || p.category === cat;
      const byTxt = !q || `${p.name} ${p.sku}`.toLowerCase().includes(q);
      return byCat && byTxt;
    });
  }, [query, cat]);

  // Linhas do carrinho
  const cartLines = useMemo(() => {
    return cart
      .map((line) => {
        const p = SAMPLE_PRODUCTS.find((x) => x.id === line.id);
        if (!p) return null;
        return { ...line, product: p, unit: p.retail, subtotal: p.retail * line.qty };
      })
      .filter(Boolean);
  }, [cart]);

  const subtotal = cartLines.reduce((acc, l) => acc + l.subtotal, 0);
  const freteValor = freteSelecionado?.price || 0;
  const total = subtotal + (freteSelecionado ? freteValor : 0);

  function addToCart(product, color = null) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.id === product.id && l.color === color);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { id: product.id, qty: 1, color }];
    });
  }
  function updateQty(line, delta) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.id === line.id && l.color === line.color);
      if (idx < 0) return prev;
      const next = [...prev];
      const q = Math.max(1, next[idx].qty + delta);
      next[idx] = { ...next[idx], qty: q };
      return next;
    });
  }
  function removeLine(line) {
    setCart((prev) => prev.filter((l) => !(l.id === line.id && l.color === line.color)));
  }

  function montarVolumesDoCarrinho() {
    // 1 volume por linha (simples). Você pode otimizar depois.
    return cartLines.map((l) => {
      const p = l.product;
      const qty = l.qty;
      // Correios: mín. 16x11x2 cm e peso > 0.
      return {
        weight_g: Math.max(50, (p.weight_g || 50) * qty),
        length_cm: Math.max(16, p.length_cm || 16),
        height_cm: Math.max(2, p.height_cm || 2),
        width_cm: Math.max(11, p.width_cm || 11),
        price_brl: p.retail * qty,
      };
    });
  }

  async function calcularFrete() {
    if (cartLines.length === 0) return alert("Seu carrinho está vazio.");
    const cepNum = cepCliente.replace(/\D/g, "");
    if (cepNum.length !== 8) return alert("Informe um CEP válido com 8 dígitos.");

    setFreteLoading(true);
    setFreteOpcoes([]);
    setFreteSelecionado(null);
    try {
      const resp = await fetch("/api/frete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: CEP_ORIGEM,
          to: cepCliente,
          volumes: montarVolumesDoCarrinho(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error(data);
        alert("Erro ao calcular frete. Tente novamente.");
        return;
      }
      setFreteOpcoes(data.options || []);
    } catch (e) {
      console.error(e);
      alert("Erro inesperado ao calcular frete.");
    } finally {
      setFreteLoading(false);
    }
  }

  async function finalizarPedido() {
    if (cartLines.length === 0) return alert("Seu carrinho está vazio.");
    if (!freteSelecionado) return alert("Selecione uma opção de frete dos Correios.");
    if (!cliente.nome || !cliente.email || !cliente.endereco || !cliente.cidade || !cliente.uf || !cepCliente) {
      return alert("Preencha nome, e‑mail, endereço, cidade, UF e CEP.");
    }

    try {
      const resp = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { ...cliente, cep: cepCliente },
          items: cartLines.map((l) => ({
            id: l.product.id,
            sku: l.product.sku,
            name: l.product.name,
            color: l.color,
            qty: l.qty,
            unit: l.unit,
            subtotal: l.subtotal,
            weight_g: l.product.weight_g,
            length_cm: l.product.length_cm,
            height_cm: l.product.height_cm,
            width_cm: l.product.width_cm,
          })),
          subtotal,
          shipping: {
            service: freteSelecionado.service,
            price: freteSelecionado.price,
            deadline: freteSelecionado.deadline,
          },
          total,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error(data);
        alert("Não foi possível finalizar. Tente novamente.");
        return;
      }

      // Sucesso: exibe confirmação com código de rastreio
      alert(
        `Pedido finalizado!\n\nNúmero: ${data.order_id || "—"}\nRastreamento: ${data.tracking_code || "—"}\n\nVocê receberá um e‑mail com os detalhes.`
      );
      // Reset básico
      setCart([]);
      setFreteOpcoes([]);
      setFreteSelecionado(null);
      setCepCliente("");
    } catch (e) {
      console.error(e);
      alert("Erro inesperado ao finalizar pedido.");
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-orange-500 flex items-center justify-center font-bold">EE</div>
            <div>
              <h1 className="text-lg font-semibold">Espaço Estyle Beauty Online</h1>
              <p className="text-xs text-neutral-400">Checkout 100% no site · Correios (SuperFrete)</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-64 rounded-xl bg-neutral-800 px-4 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-orange-500"
              placeholder="Buscar produtos, SKU…"
            />
            <CartButton cartLines={cartLines} subtotal={subtotal} />
          </div>
        </div>
      </header>

      {/* Grade de produtos */}
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-between">
          <nav className="flex flex-wrap gap-2">
            <CategoryPill label="Todos" active={cat === "all"} onClick={() => setCat("all")} />
            {CATEGORIES.map((c) => (
              <CategoryPill key={c.id} label={c.name} active={cat === c.id} onClick={() => setCat(c.id)} />
            ))}
          </nav>
          <small className="text-neutral-400">{filtered.length} itens</small>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} addToCart={addToCart} />
          ))}
        </div>
      </main>

      {/* Checkout Correios */}
      <section className="mx-auto max-w-7xl px-4 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Entrega */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="text-lg font-semibold">Entrega – Correios</h3>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <input
                  value={cepCliente}
                  onChange={(e) => setCepCliente(e.target.value)}
                  className="flex-1 rounded-xl bg-neutral-800 px-3 py-2 text-sm ring-1 ring-neutral-700 focus:ring-orange-500"
                  placeholder="Seu CEP (ex: 20770-280)"
                />
                <button
                  onClick={calcularFrete}
                  disabled={freteLoading}
                  className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold hover:bg-orange-400 disabled:opacity-50"
                >
                  {freteLoading ? "Calculando..." : "Calcular frete"}
                </button>
              </div>

              {freteOpcoes.length > 0 && (
                <ul className="space-y-2">
                  {freteOpcoes.map((opt, idx) => (
                    <li key={idx}>
                      <button
                        onClick={() => setFreteSelecionado(opt)}
                        className={classNames(
                          "w-full text-left rounded-xl px-4 py-3 ring-1",
                          freteSelecionado === opt
                            ? "ring-orange-500 bg-neutral-800"
                            : "ring-neutral-800 hover:ring-neutral-700"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">{opt.service || "Correios"}</p>
                            {opt.deadline && (
                              <p className="text-xs text-neutral-400">Prazo: {opt.deadline} dias úteis</p>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-orange-400">
                            {BRL(Number(opt.price || 0))}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Dados do cliente */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="text-lg font-semibold">Seus dados</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Input label="Nome completo" value={cliente.nome} onChange={(v) => setCliente({ ...cliente, nome: v })} className="col-span-2" />
              <Input label="E‑mail" value={cliente.email} onChange={(v) => setCliente({ ...cliente, email: v })} className="col-span-2" />
              <Input label="CPF" value={cliente.cpf} onChange={(v) => setCliente({ ...cliente, cpf: v })} />
              <Input label="Telefone" value={cliente.telefone} onChange={(v) => setCliente({ ...cliente, telefone: v })} />
              <Input label="Endereço" value={cliente.endereco} onChange={(v) => setCliente({ ...cliente, endereco: v })} className="col-span-2" />
              <Input label="Número" value={cliente.numero} onChange={(v) => setCliente({ ...cliente, numero: v })} />
              <Input label="Complemento" value={cliente.complemento} onChange={(v) => setCliente({ ...cliente, complemento: v })} />
              <Input label="Bairro" value={cliente.bairro} onChange={(v) => setCliente({ ...cliente, bairro: v })} />
              <Input label="Cidade" value={cliente.cidade} onChange={(v) => setCliente({ ...cliente, cidade: v })} />
              <Input label="UF" value={cliente.uf} onChange={(v) => setCliente({ ...cliente, uf: v })} />
            </div>
          </div>

          {/* Resumo */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h3 className="text-lg font-semibold">Resumo</h3>
            <div className="mt-3 space-y-3 text-sm">
              {cartLines.length === 0 ? (
                <p className="text-neutral-400">Seu carrinho está vazio.</p>
              ) : (
                <ul className="divide-y divide-neutral-800">
                  {cartLines.map((l) => (
                    <li key={l.id + (l.color || "") + "sum"} className="py-2 flex items-center gap-3">
                      <div className="flex-1">
                        <p className="font-medium">{l.product.name}{l.color ? ` (${l.color})` : ""}</p>
                        <p className="text-xs text-neutral-400">{BRL(l.unit)} x {l.qty} = {BRL(l.subtotal)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="rounded-lg ring-1 ring-neutral-700 px-2" onClick={() => updateQty(l, -1)}>-</button>
                        <span className="w-6 text-center">{l.qty}</span>
                        <button className="rounded-lg ring-1 ring-neutral-700 px-2" onClick={() => updateQty(l, 1)}>+</button>
                        <button className="rounded-lg ring-1 ring-neutral-700 px-2" onClick={() => removeLine(l)}>x</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-neutral-400">Subtotal</span>
                <span className="text-base font-semibold">{BRL(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-400">Frete (Correios)</span>
                <span className="text-base font-semibold">{freteSelecionado ? BRL(freteValor) : "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-400">Total</span>
                <span className="text-base font-semibold text-orange-400">{BRL(total)}</span>
              </div>

              <button
                onClick={finalizarPedido}
                className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold shadow hover:bg-orange-400 disabled:opacity-50"
                disabled={cartLines.length === 0 || !freteSelecionado}
              >
                Finalizar pedido
              </button>
              <p className="text-[11px] text-neutral-500 mt-2">Ao finalizar, o pedido é registrado e você recebe e‑mail com o código de rastreio.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="border-t border-neutral-800 bg-neutral-900/80">
        <div className="mx-auto max-w-7xl px-4 py-8 grid gap-6 md:grid-cols-3 text-sm">
          <div>
            <p className="font-semibold">Espaço Estyle Beauty</p>
            <p className="text-neutral-400 mt-1">Beleza com praticidade – Correios com rastreio por e‑mail.</p>
          </div>
          <div>
            <p className="font-semibold">Contato</p>
            <p className="text-neutral-400 mt-1">E‑mail: contato@estylebeauty.com</p>
          </div>
          <div>
            <p className="font-semibold">Pagamentos</p>
            <p className="text-neutral-400 mt-1">Pix e Cartão (integração futura PagSeguro)</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CartButton({ cartLines, subtotal }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 ring-neutral-700 hover:ring-orange-500"
      >
        Carrinho
        {cartLines.length > 0 && (
          <span className="ml-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold">
            {cartLines.reduce((acc, l) => acc + l.qty, 0)}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[320px] rounded-2xl border border-neutral-800 bg-neutral-900 p-3 shadow-2xl">
          <p className="text-sm font-semibold">Resumo rápido</p>
          {cartLines.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">Sem itens no carrinho.</p>
          ) : (
            <ul className="mt-2 max-h-64 overflow-auto space-y-2 text-sm">
              {cartLines.map((l) => (
                <li key={l.id + (l.color || "") + "mini"} className="flex items-center justify-between gap-2">
                  <span className="truncate">{l.product.name}{l.color ? ` (${l.color})` : ""}</span>
                  <span className="text-neutral-300">{l.qty}× {BRL(l.unit)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-neutral-400">Subtotal</span>
            <span className="font-semibold text-orange-400">{BRL(subtotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        "rounded-2xl px-4 py-2 text-sm",
        active
          ? "bg-orange-500 text-neutral-900 font-semibold"
          : "ring-1 ring-neutral-700 hover:ring-orange-500 text-neutral-200"
      )}
    >
      {label}
    </button>
  );
}

function ProductCard({ product, addToCart }) {
  const [selectedColor, setSelectedColor] = useState(product.colors[0] || null);
  return (
    <div className="group rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-neutral-800">
        <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-tight">{product.name}</h3>
          <span className="rounded-lg bg-neutral-800 px-2 py-1 text-[11px] text-neutral-300">{product.sku}</span>
        </div>
        <p className="text-sm text-neutral-400">
          {CATEGORIES.find((c) => c.id === product.category)?.name}
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-xl font-bold text-orange-400">{BRL(product.retail)}</span>
        </div>

        {product.colors?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {product.colors.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                className={classNames(
                  "rounded-lg px-3 py-1 text-xs",
                  selectedColor === c ? "bg-orange-500 text-neutral-900" : "ring-1 ring-neutral-700 hover:ring-orange-500"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <button
          className="mt-3 w-full rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold hover:bg-orange-400"
          onClick={() => addToCart(product, selectedColor)}
        >
          Adicionar ao carrinho
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, className }) {
  return (
    <label className={classNames("block", className)}>
      <span className="text-xs text-neutral-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl bg-neutral-800 px-3 py-2 text-sm ring-1 ring-neutral-700 focus:ring-orange-500"
      />
    </label>
  );
}
