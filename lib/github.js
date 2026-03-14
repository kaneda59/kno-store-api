/**
 * lib/github.js — Accès repo privé GitHub (GITHUB_TOKEN côté serveur uniquement)
 */
const https = require('https');

const OWNER = process.env.GITHUB_OWNER || 'kaneda59';
const REPO  = process.env.GITHUB_REPO  || 'kno-drivers-registry';

function githubRequest(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept':        'application/vnd.github.v3+json',
        'User-Agent':    'kno-store/1.0',
        ...opts.headers,
      },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

/**
 * Liste les fichiers d'un driver (sans exposer les download_url).
 */
async function listDriverFiles(github_path) {
  const { status, body } = await githubRequest(
    `/repos/${OWNER}/${REPO}/contents/${github_path}`
  );
  if (status !== 200) throw new Error(`GitHub API ${status}: ${JSON.stringify(body)}`);
  if (!Array.isArray(body)) throw new Error('Unexpected GitHub response');
  return body.map(f => ({ name: f.name, size: f.size, sha: f.sha }));
}

/**
 * Proxy-stream un fichier depuis GitHub vers res (ServerResponse).
 * Le GITHUB_TOKEN ne quitte jamais le serveur.
 */
async function proxyFile(github_path, filename, res) {
  const safeName = require('path').basename(filename);
  const rawUrl   = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${github_path}/${safeName}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'raw.githubusercontent.com',
      path:     `/${OWNER}/${REPO}/main/${github_path}/${safeName}`,
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'User-Agent':    'kno-store/1.0',
      },
    };
    https.get(options, (ghRes) => {
      if (ghRes.statusCode === 404) {
        reject(new Error(`File not found: ${safeName}`));
        return;
      }
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      if (ghRes.headers['content-length']) {
        res.setHeader('Content-Length', ghRes.headers['content-length']);
      }
      ghRes.pipe(res);
      ghRes.on('end', resolve);
      ghRes.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Charge le registry.json depuis le repo (avec auth — repo privé).
 */
async function fetchRegistry() {
  const { status, body } = await githubRequest(
    `/repos/${OWNER}/${REPO}/contents/registry.json`
  );
  if (status !== 200) throw new Error(`Registry not found (${status})`);
  // GitHub retourne le contenu en base64
  const content = Buffer.from(body.content, 'base64').toString('utf-8');
  return JSON.parse(content);
}

module.exports = { listDriverFiles, proxyFile, fetchRegistry };
