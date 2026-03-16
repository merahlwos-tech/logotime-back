const express = require('express')
const router  = express.Router()
const { authenticateAdmin } = require('../middleware/auth')

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN        || ''
const GITHUB_OWNER  = process.env.GITHUB_OWNER        || 'merahlwos-tech'
const GITHUB_REPO   = process.env.GITHUB_FRONT_REPO   || 'logotime-front'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH       || 'main'

const ghHeaders = () => ({
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
})

/* ── GET /api/github/images ─────────────────────────────────────────────────
   Liste les images disponibles dans public/ du repo front
─────────────────────────────────────────────────────────────────────────── */
router.get('/images', authenticateAdmin, async (req, res) => {
  try {
    const MANAGED = [
      { key: 'main',      path: 'public/main.webp',      label: 'Hero Mobile' },
      { key: 'mainPC',    path: 'public/mainPC.webp',     label: 'Hero Desktop' },
      { key: 'boite',     path: 'public/boite.webp',      label: 'Catégorie Boites' },
      { key: 'sacs',      path: 'public/sacs.webp',       label: 'Catégorie Sacs (mobile)' },
      { key: 'sacsPC',    path: 'public/sacsPC.webp',     label: 'Catégorie Sacs (desktop)' },
      { key: 'carte',     path: 'public/carte.webp',      label: 'Catégorie Cartes' },
      { key: 'papier',    path: 'public/papier.webp',     label: 'Catégorie Papier' },
      { key: 'before',    path: 'public/before.webp',     label: 'Avant/Après — Avant' },
      { key: 'after',     path: 'public/after.webp',      label: 'Avant/Après — Après' },
    ]

    // Récupère le SHA de chaque fichier (nécessaire pour la mise à jour)
    const results = await Promise.all(MANAGED.map(async img => {
      try {
        const r = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${img.path}?ref=${GITHUB_BRANCH}`,
          { headers: ghHeaders() }
        )
        if (!r.ok) return { ...img, sha: null, exists: false }
        const data = await r.json()
        return { ...img, sha: data.sha, exists: true }
      } catch {
        return { ...img, sha: null, exists: false }
      }
    }))

    res.json(results)
  } catch (err) {
    console.error('[GITHUB] images list error:', err.message)
    res.status(500).json({ message: 'Erreur GitHub', error: err.message })
  }
})

/* ── POST /api/github/upload ────────────────────────────────────────────────
   Remplace une image dans le repo front via l'API GitHub
   Body: { key, base64, sha }
─────────────────────────────────────────────────────────────────────────── */
router.post('/upload', authenticateAdmin, async (req, res) => {
  try {
    const { key, base64, sha } = req.body

    if (!key || !base64) {
      return res.status(400).json({ message: 'key et base64 requis' })
    }
    if (!GITHUB_TOKEN) {
      return res.status(500).json({ message: 'GITHUB_TOKEN non configuré sur le serveur' })
    }

    const FILE_PATHS = {
      main:    'public/main.webp',
      mainPC:  'public/mainPC.webp',
      boite:   'public/boite.webp',
      sacs:    'public/sacs.webp',
      sacsPC:  'public/sacsPC.webp',
      carte:   'public/carte.webp',
      papier:  'public/papier.webp',
      before:  'public/before.webp',
      after:   'public/after.webp',
    }

    const filePath = FILE_PATHS[key]
    if (!filePath) {
      return res.status(400).json({ message: `Clé inconnue : ${key}` })
    }

    // Contenu base64 — retire le préfixe data:image/...;base64, si présent
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '')

    const body = {
      message: `chore: update ${key} image via admin panel`,
      content: cleanBase64,
      branch:  GITHUB_BRANCH,
    }

    // Si le fichier existe déjà on fournit son SHA
    if (sha) body.sha = sha

    const r = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) }
    )

    const data = await r.json()

    if (!r.ok) {
      console.error('[GITHUB] upload error:', data)
      return res.status(r.status).json({ message: data.message || 'Erreur GitHub', details: data })
    }

    res.json({
      success: true,
      message: `${key} mis à jour — déploiement Cloudflare en cours`,
      sha: data.content?.sha,
    })
  } catch (err) {
    console.error('[GITHUB] upload error:', err.message)
    res.status(500).json({ message: 'Erreur serveur', error: err.message })
  }
})

module.exports = router