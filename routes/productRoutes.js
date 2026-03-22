const express  = require('express')
const router   = express.Router()
const Product  = require('../models/Product')
const { authenticateAdmin } = require('../middleware/auth')
const { deleteProductImageFromR2 } = require('../utils/uploadR2')

router.get('/', async (req, res) => {
  try {
    const { category } = req.query
    const filter   = category ? { category } : {}
    const products = await Product.find(filter).sort({ createdAt: -1 }).lean()
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
    res.json(products)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean()
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' })
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')
    res.json(product)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// ── Helper : parse les champs JSON string envoyés par FormData ────────────
function parseBody(body) {
  const b = { ...body }
  if (typeof b.sizes      === 'string') b.sizes      = JSON.parse(b.sizes)
  if (typeof b.colors     === 'string') b.colors     = JSON.parse(b.colors)
  if (typeof b.tags       === 'string') b.tags       = JSON.parse(b.tags)
  if (typeof b.packItems  === 'string') b.packItems  = JSON.parse(b.packItems)
  if (typeof b.doubleSided        === 'string') b.doubleSided        = b.doubleSided        === 'true'
  if (typeof b.colorDesignEnabled === 'string') b.colorDesignEnabled = b.colorDesignEnabled === 'true'
  if (b.images && !Array.isArray(b.images)) b.images = [b.images]
  if (!b.images) b.images = []
  return b
}

// ── Helper : recalculer les packs qui contiennent ce produit ─────────────
async function updatePacksContaining(productId, updatedSizes) {
  try {
    // Trouver tous les packs qui référencent ce produit
    const packs = await Product.find({
      category: 'Pack',
      'packItems.productId': productId,
    })

    for (const pack of packs) {
      let changed = false
      const newPackItems = pack.packItems.map(item => {
        if (String(item.productId) !== String(productId)) return item
        // Trouver le nouveau prix pour la taille correspondante
        const sizeObj = updatedSizes?.find(s => s.size === item.size)
        if (sizeObj && sizeObj.price !== item.unitPrice) {
          changed = true
          return { ...item.toObject(), unitPrice: sizeObj.price }
        }
        return item
      })

      if (changed) {
        // Recalculer le prix total du pack
        const newTotal = newPackItems.reduce(
          (sum, item) => sum + item.unitPrice * item.quantity, 0
        )
        await Product.findByIdAndUpdate(pack._id, {
          $set: {
            packItems: newPackItems,
            sizes: [{ size: 'Pack Complet', price: newTotal }],
          }
        })
      }
    }
  } catch (err) {
    console.error('Erreur mise à jour packs:', err.message)
    // Non bloquant : ne pas faire échouer la requête principale
  }
}

router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const body = parseBody(req.body)

    // Pour les produits non-Pack : s'assurer que packItems est absent/vide
    if (body.category !== 'Pack') {
      delete body.packItems
      delete body.freeDelivery
    }

    const product    = new Product(body)
    const newProduct = await product.save()
    res.status(201).json(newProduct)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' })

    const body = parseBody(req.body)

    if (!body.images || body.images.length === 0) body.images = product.images

    // Pour les produits non-Pack : ne pas toucher aux champs pack
    if (body.category !== 'Pack') {
      delete body.packItems
      delete body.freeDelivery
    }

    // Utiliser $set explicitement pour éviter tout remplacement accidentel
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: body },
      { new: true, runValidators: false }   // runValidators: false pour les updates partiels
    )

    // Si les tailles ont changé sur un produit normal → recalculer les packs liés
    if (body.category !== 'Pack' && body.sizes?.length > 0) {
      await updatePacksContaining(req.params.id, body.sizes)
    }

    res.json(updated)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' })

    if (product.images?.length > 0) {
      await Promise.all(product.images.map(deleteProductImageFromR2))
    }
    await Product.findByIdAndDelete(req.params.id)
    res.json({ message: 'Produit et images supprimés' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router