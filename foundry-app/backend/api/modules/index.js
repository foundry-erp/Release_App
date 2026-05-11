const { requireAuth } = require('../../middleware/auth');
const { supabase }    = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => null);

  if (res.headersSent) return;

  const userId = req.user.sub;

  // Query: user_module_permissions → modules → module_versions
  // !inner on modules ensures soft-deleted modules (is_active=false) are excluded.
  // NOTE: !inner requires PostgREST v10+. If your Supabase project is older,
  // remove !inner and add .filter('module.is_active', 'eq', true) after the query.
  const { data: rows, error } = await supabase
    .from('user_module_permissions')
    .select(`
      permissions,
      module:modules!inner (
        id,
        slug,
        name,
        is_active,
        module_versions (
          id,
          version,
          cdn_url,
          index_url,
          checksum,
          signature,
          size_kb,
          is_active,
          created_at
        )
      )
    `)
    .eq('user_id', userId)
    .eq('module.is_active', true);

  if (error) {
    console.error('Supabase modules fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch modules' });
  }

  // Pick newest active module_version per module
  const modules = (rows || [])
    .map((row) => {
      const mod = row.module;
      if (!mod) return null;

      const activeVersions = (mod.module_versions || [])
        .filter((v) => v.is_active)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const v = activeVersions[0];
      if (!v) return null;

      return {
        id:          mod.id,
        slug:        mod.slug,
        name:        mod.name,
        version:     v.version,
        cdn_url:     v.cdn_url,
        index_url:   v.index_url,
        checksum:    v.checksum,
        signature:   v.signature ?? null,
        size_kb:     v.size_kb,
        permissions: row.permissions,
      };
    })
    .filter(Boolean);

  return res.status(200).json({ modules });
};
