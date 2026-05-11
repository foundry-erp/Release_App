const { requireAuth } = require('../../middleware/auth');
const { supabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => null);

  if (res.headersSent) return;

  const { id, description } = req.body;

  if (!id || description === undefined || description === null) {
    return res.status(400).json({ error: 'Both id and description are required' });
  }

  const { data: product, error } = await supabase
    .from('products')
    .update({ description })
    .eq('id', id)
    .select('id, description')
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to update product' });
  }

  return res.status(200).json({ success: true, product: { id: product.id, description: product.description } });
};
