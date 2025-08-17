export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    node: process.version,
    has_SUPERFRETE_API_KEY: Boolean(process.env.SUPERFRETE_API_KEY),
    quote_url: process.env.SUPERFRETE_QUOTE_URL || "https://api.superfrete.com.br/v0/quote"
  });
}
