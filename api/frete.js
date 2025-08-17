// api/frete.js
const QUOTE_URL = process.env.SUPERFRETE_QUOTE_URL || "https://api.superfrete.com.br/v0/quote";

// Lê o JSON mesmo quando a Vercel não parseia req.body
async function readJsonBody(req) {
  if (req.body && Object.keys(req.body).length) return req.body;
  const buf = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  try { return buf ? JSON.parse(buf) : {}; } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const apiKey = process.env.SUPERFRETE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "SUPERFRETE_API_KEY não configurada" });

    const body = await readJsonBody(req);
    const { from, to, volumes } = body || {};
    if (!from || !to || !Array.isArray(volumes) || volumes.length === 0) {
      return res.status(400).json({ error: "Parâmetros inválidos. Envie { from, to, volumes[] }" });
    }

    const payload = {
      from: { postal_code: String(from).replace(/\D/g, "") || from },
      to:   { postal_code: String(to).replace(/\D/g, "") || to },
      volumes: volumes.map(v => ({
        weight: Number(v.weight_g ?? v.weight ?? 0) || 50,
        length: Number(v.length_cm ?? v.length ?? 16) || 16,
        height: Number(v.height_cm ?? v.height ?? 2)  || 2,
        width:  Number(v.width_cm  ?? v.width  ?? 11) || 11,
        price:  Number(v.price_brl ?? v.price  ?? 0)  || 0,
      })),
    };

    const resp = await fetch(QUOTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[/api/frete] SuperFrete erro:", data);
      return res.status(resp.status).json({ error: "Falha na cotação", detail: data || null });
    }

    const list = Array.isArray(data?.services) ? data.services : Array.isArray(data) ? data : [];
    const options = list.map(s => ({
      service: s?.name || s?.service || "Correios",
      price: Number(s?.price ?? s?.total ?? 0),
      deadline: s?.deadline ?? s?.delivery_time ?? null,
      raw: s,
    })).filter(o => Number.isFinite(o.price));

    return res.status(200).json({ options });
  } catch (e) {
    console.error("[/api/frete] ERRO:", e);
    return res.status(500).json({ error: "Erro interno", detail: String(e) });
  }
}
