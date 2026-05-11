const { requireAuth } = require('../../middleware/auth');
const { supabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => null);

  if (res.headersSent) return;

  const { data: products, error } = await supabase
    .from('products')
    .select('id, barcode, name, description')
    .order('name', { ascending: true })
    .limit(100);

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch products' });
  }

  return res.status(200).json({ products: products || [] });
};
