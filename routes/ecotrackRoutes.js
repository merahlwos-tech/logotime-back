const express = require('express')
const router  = express.Router()
const { authenticateAdmin } = require('../middleware/auth')

const ECOTRACK_BASE  = process.env.ECOTRACK_BASE_URL  || 'https://platform.dhd-dz.com'
const ECOTRACK_TOKEN = (process.env.ECOTRACK_API_TOKEN || '').trim()

const ecoHeaders = () => ({
  'Content-Type': 'application/json',
  ...(ECOTRACK_TOKEN ? { Authorization: `Bearer ${ECOTRACK_TOKEN}` } : {}),
})

// Cache mémoire 10 min
const cache = new Map()
function getCached(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > 10 * 60 * 1000) { cache.delete(key); return null }
  return entry.data
}

// ─── GET /api/ecotrack/wilayas ───────────────────────────────────────────────
router.get('/wilayas', async (req, res) => {
  try {
    const cached = getCached('wilayas')
    if (cached) return res.json(cached)
    const resp = await fetch(`${ECOTRACK_BASE}/api/v1/get/wilayas`, { headers: ecoHeaders() })
    if (!resp.ok) throw new Error(`ECOTRACK wilayas: ${resp.status}`)
    const data = await resp.json()
    const raw = Array.isArray(data) ? data : []
    // DHD retourne { id, name, ar_name, code }
    // Le front attend { wilaya_id, wilaya_name }
    const list = raw.map(w => ({
      wilaya_id:   w.wilaya_id   ?? w.id   ?? w.code ?? '',
      wilaya_name: w.wilaya_name ?? w.name ?? w.nom  ?? '',
      ar_name:     w.ar_name     ?? w.ar   ?? '',
      code:        w.code        ?? w.id   ?? '',
    })).filter(w => w.wilaya_id !== '')
    cache.set('wilayas', { data: list, ts: Date.now() })
    res.json(list)
  } catch (err) {
    console.error('[ECOTRACK] wilayas error:', err.message)
    res.status(502).json({ message: 'Erreur ECOTRACK wilayas', error: err.message })
  }
})

// ─── GET /api/ecotrack/communes?wilaya_id=16 ────────────────────────────────
// Stratégie : récupère TOUTES les communes une seule fois, met en cache,
// puis filtre côté serveur par wilaya_id — évite les 422 de DHD
router.get('/communes', async (req, res) => {
  try {
    const { wilaya_id } = req.query

    // 1. Charger toutes les communes (cache global)
    let allCommunes = getCached('all_communes')
    if (!allCommunes) {
      const tryUrls = [
        `${ECOTRACK_BASE}/api/v1/get/communes`,
        `${ECOTRACK_BASE}/api/v1/communes`,
      ]
      let raw = null
      for (const url of tryUrls) {
        try {
          const resp = await fetch(url, { headers: ecoHeaders() })
          if (resp.ok) {
            const json = await resp.json()
            raw = Array.isArray(json) ? json : Object.values(json)
            console.log(`[ECOTRACK] communes all OK from: ${url} (${raw.length})`)
            break
          }
        } catch {}
      }
      if (!raw) return res.status(502).json({ message: 'Impossible de charger les communes' })

      // Normalise
      allCommunes = raw.map(co => ({
        id:            co.id           ?? co.commune_id ?? co.code ?? '',
        nom:           co.nom          ?? co.name       ?? co.commune_name ?? '',
        wilaya_id:     String(co.wilaya_id ?? co.wilaya ?? ''),
        has_stop_desk: Number(co.has_stop_desk ?? co.stop_desk ?? co.stopdesk ?? 0),
      })).filter(co => co.id !== '')

      cache.set('all_communes', { data: allCommunes, ts: Date.now() })
    }

    // 2. Filtrer par wilaya_id si fourni
    const result = wilaya_id
      ? allCommunes.filter(co => String(co.wilaya_id) === String(wilaya_id))
      : allCommunes

    // Cache par wilaya
    const cacheKey = `communes_${wilaya_id || 'all'}`
    cache.set(cacheKey, { data: result, ts: Date.now() })

    res.json(result)
  } catch (err) {
    console.error('[ECOTRACK] communes error:', err.message)
    res.status(502).json({ message: 'Erreur ECOTRACK communes', error: err.message })
  }
})

// ─── GET /api/ecotrack/fees ──────────────────────────────────────────────────
router.get('/fees', async (req, res) => {
  try {
    const cached = getCached('fees')
    if (cached) return res.json(cached)

    const tryUrls = [
      `${ECOTRACK_BASE}/api/v1/get/fees`,
      `${ECOTRACK_BASE}/api/v1/fees`,
      `${ECOTRACK_BASE}/api/v1/get/delivery-fees`,
      `${ECOTRACK_BASE}/api/v1/get/tarifs`,
      `${ECOTRACK_BASE}/api/v1/tarifs`,
    ]

    let list = null
    let lastError = ''
    for (const url of tryUrls) {
      try {
        const resp = await fetch(url, { headers: ecoHeaders() })
        if (resp.ok) {
          const data = await resp.json()
          list = Array.isArray(data) ? data : (data?.livraison || data?.fees || data?.tarifs || Object.values(data))
          console.log(`[ECOTRACK] fees OK from: ${url}`)
          break
        }
        lastError = `${resp.status} on ${url}`
      } catch (e) {
        lastError = e.message
      }
    }

    if (!list) throw new Error(`Toutes les URLs fees ont échoué. Dernier: ${lastError}`)

    // Normalise selon la doc DHD : { wilaya_id, home_fee, desk_fee }
    // Le front attend : { wilaya_id, tarif, tarif_stopdesk }
    const normalized = list.map(f => ({
      wilaya_id:      f.wilaya_id ?? f.id   ?? f.code ?? '',
      wilaya_name:    f.wilaya_name ?? f.name ?? f.nom ?? '',
      tarif:          Number(f.tarif ?? f.home_fee ?? f.domicile ?? f.home ?? f.prix ?? 0),
      tarif_stopdesk: Number(f.tarif_stopdesk ?? f.desk_fee ?? f.stop_desk ?? f.stopdesk ?? f.bureau ?? f.stop ?? 0),
    })).filter(f => f.wilaya_id !== '')

    console.log(`[ECOTRACK] fees OK: ${normalized.length} wilayas, sample:`, JSON.stringify(normalized[0] || {}))

    cache.set('fees', { data: normalized, ts: Date.now() })
    res.json(normalized)
  } catch (err) {
    console.error('[ECOTRACK] fees error:', err.message)
    res.status(502).json({ message: 'Erreur ECOTRACK fees', error: err.message })
  }
})

// ─── POST /api/ecotrack/send-order/:id ───────────────────────────────────────
// Envoie la commande à Ecotrack et sauvegarde le tracking
router.post('/send-order/:id', authenticateAdmin, async (req, res) => {
  try {
    const Order = require('../models/Order')
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: 'Commande introuvable' })

    // Déjà envoyée ?
    if (order.ecotrackTracking) {
      return res.json({
        success: true,
        tracking: order.ecotrackTracking,
        alreadySent: true,
        message: 'Commande déjà envoyée à Ecotrack',
      })
    }

    const { customerInfo, total, items } = order
    const wilayaCode = customerInfo.wilayaCode

    if (!wilayaCode) {
      return res.status(400).json({
        message: 'Code wilaya manquant — commande passée avant la mise à jour.',
      })
    }

    // Construction du nom du produit pour Ecotrack
    const produitLabel = items.map(i => `${i.name} x${i.quantity}`).join(', ').slice(0, 255)

    const params = new URLSearchParams({
      reference:   order._id.toString().slice(-8).toUpperCase(),
      nom_client:  `${customerInfo.firstName} ${customerInfo.lastName}`,
      telephone:   customerInfo.phone.replace(/\s/g, ''),
      adresse:     customerInfo.commune,
      commune:     customerInfo.commune,
      code_wilaya: String(wilayaCode),
      montant:     String(total),
      type:        '1',  // Livraison
      stop_desk:   customerInfo.deliveryMethod === 'Stop Desk' ? '1' : '0',
      produit:     produitLabel,
    })

    const url = `${ECOTRACK_BASE}/api/v1/create/order?${params.toString()}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: ecoHeaders(),
    })

    const data = await resp.json()

    if (!data.success) {
      console.error('[ECOTRACK] send-order error:', data)
      return res.status(400).json({
        message: data.message || 'Erreur Ecotrack',
        errors: data.errors || null,
      })
    }

    // Sauvegarde du tracking
    order.ecotrackTracking = data.tracking
    order.ecotrackSentAt   = new Date()
    await order.save()

    res.json({ success: true, tracking: data.tracking })

  } catch (err) {
    console.error('[ECOTRACK] send-order error:', err.message)
    res.status(500).json({ message: 'Erreur serveur', error: err.message })
  }
})

// ─── GET /api/ecotrack/label/:tracking ───────────────────────────────────────
// Proxy pour télécharger l'étiquette PDF depuis Ecotrack
router.get('/label/:tracking', authenticateAdmin, async (req, res) => {
  try {
    const { tracking } = req.params
    const url = `${ECOTRACK_BASE}/api/v1/get/order/label?tracking=${encodeURIComponent(tracking)}`

    const resp = await fetch(url, { headers: ecoHeaders() })

    if (!resp.ok) {
      return res.status(resp.status).json({ message: `Ecotrack label: ${resp.status}` })
    }

    // Retransmission du PDF
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="etiquette-${tracking}.pdf"`)

    const buffer = await resp.arrayBuffer()
    res.send(Buffer.from(buffer))

  } catch (err) {
    console.error('[ECOTRACK] label error:', err.message)
    res.status(500).json({ message: 'Erreur serveur', error: err.message })
  }
})

module.exports = router