/**
 * api/download.js
 * Sert les fichiers drivers depuis le repo GitHub privé via proxy.
 * Le GITHUB_TOKEN ne quitte jamais le serveur.
 * Utilise registry.json local pour les métadonnées.
 */
const { listDriverFiles, proxyFile } = require('../lib/github');
const { getDownloadToken, markFileDownloaded } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { token, file } = req.query;
  if (!token) return res.status(400).json({ error: 'token requis' });

  // Valider le token
  const tokenData = await getDownloadToken(token);
  if (!tokenData) return res.status(403).json({ error: 'Token invalide ou expiré.' });

  try {
    // Utiliser registry local (pas d'appel GitHub API pour les métadonnées)
    const registry = require('../registry.json');
    const driver   = (registry.drivers || []).find(d => d.id === tokenData.driver_id);
    if (!driver) return res.status(404).json({ error: `Driver '${tokenData.driver_id}' introuvable.` });

    if (!driver.github_path) {
      return res.status(500).json({ error: `github_path manquant pour ${driver.id}` });
    }

    // Sans ?file= → liste des fichiers disponibles pour ce driver
    if (!file) {
      const files = await listDriverFiles(driver.github_path);
      return res.json({
        driver_id: tokenData.driver_id,
        files: files.map(f => ({
          name:         f.name,
          size:         f.size,
          download_url: `/api/download?token=${token}&file=${encodeURIComponent(f.name)}`,
        })),
      });
    }

    // Sécurité path traversal
    const safeName = require('path').basename(file);
    if (safeName !== file) return res.status(400).json({ error: 'Nom de fichier invalide.' });

    // Marquer le fichier comme téléchargé (anti-doublon dans la même session)
    const ok = await markFileDownloaded(token, safeName);
    if (!ok) return res.status(403).json({ error: 'Fichier déjà téléchargé avec ce token.' });

    // Proxy-stream depuis GitHub (GITHUB_TOKEN jamais exposé au client)
    await proxyFile(driver.github_path, safeName, res);

  } catch(e) {
    console.error('[download] ERROR:', e.message, e.stack);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};