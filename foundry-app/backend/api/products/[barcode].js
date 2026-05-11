const { requireAuth } = require('../../middleware/auth');
const { supabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => null);

  if (res.headersSent) return;

  const { barcode } = req.query;

  const { data: product, error } = await supabase
    .from('products')
    .select('id, barcode, name, description, category, unit')
    .eq('barcode', barcode)
    .single();

  if (error || !product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  return res.status(200).json({
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    description: product.description,
    category: product.category,
    unit: product.unit,
  });
};
