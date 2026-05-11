const { admin } = require('../../lib/firebase-admin');
const { supabase } = require('../../lib/supabase');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { firebase_token } = req.body;
  if (!firebase_token) {
    return res.status(400).json({ error: 'firebase_token is required' });
  }

  let firebaseUser;
  try {
    firebaseUser = await admin.auth().verifyIdToken(firebase_token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Firebase token' });
  }

  const { uid, email, name } = firebaseUser;

  // Upsert user into Supabase
  const { data: user, error } = await supabase
    .from('users')
    .upsert(
      {
        firebase_uid: uid,
        email: email || '',
        display_name: name || email || uid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'firebase_uid' }
    )
    .select()
    .single();

  if (error) {
    console.error('Supabase upsert error:', error);
    return res.status(500).json({ error: 'Failed to sync user' });
  }

  const jwtPayload = {
    sub: user.id,
    firebase_uid: uid,
    email: user.email,
    display_name: user.display_name,
  };

  const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

  return res.status(200).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
    },
  });
};
