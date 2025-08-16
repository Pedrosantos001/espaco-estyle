// api/frete.js (CommonJS)
const quoteUrl = "https://api.superfrete.com.br/v0/quote"; // ajuste para sandbox se usar sandbox

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const apiKey = process.env.SUPERFRETE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "SUPERFRETE_API_KEY não configurada" });

    const { from, to, volumes } = req.body || {};
    if (!from || !to || !Array.isArray(volumes) || volumes.length === 0) {
      return res.status(400).json({ error: "Parâmetros inválidos: from, to, volumes[]" });
    }

    const payload = {
      from: { postal_code: from },
      to: { postal_code: to },
      volumes: volumes.map(v => ({
        weight: v.weight_g,
        length: v.length_cm,
        height: v.height_cm,
        width:  v.width_cm,
        price:  v.price_brl || 0,
      })),
    };

    const response = await fetch(quoteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: "Falha na cotação", detail: data });

    const options = (data.services || data || []).map(s => ({
      service: s.name || s.service || "Correios",
      price: Number(s.price || s.total || 0),
      deadline: s.deadline || s.delivery_time || null,
      raw: s,
    }));

    res.status(200).json({ options });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro interno", detail: String(e) });
  }
};
