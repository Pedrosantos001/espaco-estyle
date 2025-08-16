// api/checkout.js (CommonJS)
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ajuste se for sandbox:
const shipmentsUrl = "https://api.superfrete.com.br/v0/shipments";

async function createShipmentOnSuperFrete(order, apiKey) {
  const payload = {
    from: { postal_code: "20770-280", name: "Espaço Estyle Beauty" }, // ajuste remetente
    to: {
      postal_code: order.customer.cep,
      name: order.customer.nome,
      email: order.customer.email,
      phone: order.customer.telefone,
      address: {
        line: order.customer.endereco,
        number: order.customer.numero,
        complement: order.customer.complemento,
        district: order.customer.bairro,
        city: order.customer.cidade,
        state: order.customer.uf,
      },
    },
    service: order.shipping.service, // PAC/SEDEX (conforme exigência da API)
    volumes: order.items.map(i => ({
      weight: i.weight_g, length: i.length_cm, height: i.height_cm, width: i.width_cm,
      price: i.unit * i.qty, sku: i.sku, description: i.name, quantity: i.qty,
    })),
  };

  const resp = await fetch(shipmentsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));

  const trackingCode = data.tracking_code || data.tracking || data.code || null;
  return { trackingCode, raw: data };
}

async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // opcional
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Espaço Estyle Beauty <no-reply@estylebeauty.com>", to: [to], subject, html }),
  });
  if (!r.ok) console.error("Falha ao enviar e-mail:", await r.text());
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const key = process.env.SUPERFRETE_API_KEY;
    if (!key) return res.status(500).json({ error: "SUPERFRETE_API_KEY não configurada" });

    const order = req.body;
    if (!order?.customer?.email || !order?.items?.length) return res.status(400).json({ error: "Pedido inválido" });

    // 1) cria envio / gera rastreio
    const { trackingCode, raw } = await createShipmentOnSuperFrete(order, key);

    // 2) salva no banco
    const client = await pool.connect();
    try {
      const q = `
        INSERT INTO orders (
          customer_name, customer_email, customer_cpf, customer_phone,
          address_line, address_number, address_complement, address_district, address_city, address_state, address_postal_code,
          items, subtotal, shipping_service, shipping_price, shipping_deadline, total, tracking_code, superfrete_raw
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING id
      `;
      const v = [
        order.customer.nome, order.customer.email, order.customer.cpf || null, order.customer.telefone || null,
        order.customer.endereco || null, order.customer.numero || null, order.customer.complemento || null,
        order.customer.bairro || null, order.customer.cidade || null, order.customer.uf || null, order.customer.cep || null,
        JSON.stringify(order.items), order.subtotal, order.shipping?.service || null, order.shipping?.price || null,
        order.shipping?.deadline || null, order.total, trackingCode, JSON.stringify(raw)
      ];
      const db = await client.query(q, v);
      const orderId = db.rows[0].id;

      // 3) e-mail com rastreio
      const assunto = `Seu pedido foi finalizado – rastreio: ${trackingCode || "em processamento"}`;
      const corpo = `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>Pedido finalizado com sucesso!</h2>
          <p>Olá ${order.customer.nome},</p>
          <p>Recebemos seu pedido e já geramos o envio pelos Correios.</p>
          <p><strong>Código de rastreio:</strong> ${trackingCode || "em processamento"}</p>
          <p>Total: <strong>R$ ${Number(order.total).toFixed(2)}</strong></p>
          <hr/><p>Espaço Estyle Beauty</p>
        </div>`;
      await sendEmail(order.customer.email, assunto, corpo);

      res.status(200).json({ ok: true, order_id: orderId, tracking_code: trackingCode });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro interno", detail: String(e) });
  }
};
