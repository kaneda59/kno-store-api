const crypto = require('crypto');
const { listDriverFiles, proxyFile } = require('../lib/github');
const { getDownloadToken, markFileDownloaded } = require('../lib/db');

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'kno-store-token-secret-2026';

// ── Vérifier un token gratuit (sans Redis) ───────────────────────────────────
function verifyFreeToken(token) {
  try {
    const parts = token.split('.');
    if (parts[0] !== 'free' || parts.length !== 3) return null;
    const [, payload, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').slice(0, 16);
    if (sig !== expectedSig) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
  } catch(e) { return null; }
}

const GITHUB_PATHS = {
  driver_json_folder:   'drivers/driver_json_folder/v1.0.0',
  driver_sql_postgres:  'drivers/driver_sql_postgres/v1.0.0',
  driver_sql_mssql:     'drivers/driver_sql_mssql/v1.0.0',
  driver_sql_mysql:     'drivers/driver_sql_mysql/v1.0.0',
  driver_sql_oracle:    'drivers/driver_sql_oracle/v1.0.0',
  driver_api_generic:   'drivers/driver_api_generic/v1.0.0',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { token, file } = req.query;
  if (!token) return res.status(400).json({ error: 'token requis' });

  try {
    let driver_id, isFree = false;

    // Token gratuit (sans Redis)
    const freeData = verifyFreeToken(token);
    if (freeData) {
      driver_id = freeData.driver_id;
      isFree    = true;
    } else {
      // Token payant (depuis Redis)
      const tokenData = await getDownloadToken(token);
      if (!tokenData) return res.status(403).json({ error: 'Token invalide ou expiré.' });
      driver_id = tokenData.driver_id;
    }

    const github_path = GITHUB_PATHS[driver_id];
    if (!github_path) return res.status(404).json({ error: `Driver '${driver_id}' inconnu.` });

    // Sans ?file= → liste des fichiers
    if (!file) {
      const files = await listDriverFiles(github_path);
      return res.json({
        driver_id,
        files: files.map(f => ({
          name:         f.name,
          size:         f.size,
          download_url: `/api/download?token=${token}&file=${encodeURIComponent(f.name)}`,
        })),
      });
    }

    // Sécurité path traversal
    const safeName = require('path').basename(file);
    if (safeName !== file) return res.status(400).json({ error: 'Nom invalide.' });

    // Pour les drivers payants : anti-doublon via Redis
    if (!isFree) {
      const ok = await markFileDownloaded(token, safeName);
      if (!ok) return res.status(403).json({ error: 'Fichier déjà téléchargé avec ce token.' });
    }

    await proxyFile(github_path, safeName, res);

  } catch(e) {
    console.error('[download]', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};