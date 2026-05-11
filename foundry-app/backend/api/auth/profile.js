const { requireAuth } = require('../../middleware/auth');
const { supabase } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Manually run middleware
  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => null);

  if (res.headersSent) return;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, display_name, created_at')
    .eq('id', req.user.sub)
    .single();

  if (error || !user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json({ user });
};
