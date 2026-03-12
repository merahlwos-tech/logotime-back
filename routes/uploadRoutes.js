// routes/uploadRoutes.js
const express = require('express')
const router  = express.Router()
const multer  = require('multer')
const { uploadProductImageToR2, deleteProductImageFromR2 } = require('../utils/uploadR2')
const { authenticateAdmin } = require('../middleware/auth')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Seules les images sont autorisées'), false)
  },
})

// POST /api/upload — Upload images produit vers Cloudflare R2 (admin uniquement)
router.post('/', authenticateAdmin, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Aucune image fournie' })
    }
    const urls = await Promise.all(
      req.files.map(file => uploadProductImageToR2(file.buffer))
    )
    res.json({ message: 'Images uploadées avec succès', urls })
  } catch (error) {
    console.error('R2 upload error:', error)
    res.status(500).json({ message: error.message })
  }
})

// DELETE /api/upload — Supprimer une image R2 (quand admin retire une image avant de sauvegarder)
router.delete('/', authenticateAdmin, async (req, res) => {
  try {
    const { url } = req.body
    if (!url) return res.status(400).json({ message: 'URL manquante' })
    await deleteProductImageFromR2(url)
    res.json({ message: 'Image supprimée' })
  } catch (error) {
    console.error('R2 delete error:', error)
    res.status(500).json({ message: error.message })
  }
})

module.exports = router

// DELETE /api/upload/logo — Supprimer un logo Cloudinary (public — appelé par le formulaire client)
// Sécurité : on vérifie que l'URL appartient bien à Cloudinary avant de supprimer
router.delete('/logo', async (req, res) => {
  try {
    const { url } = req.body
    if (!url) return res.status(400).json({ message: 'URL manquante' })

    // Vérification de sécurité — on n'accepte que les URLs Cloudinary du projet
    if (!url.includes('res.cloudinary.com')) {
      return res.status(400).json({ message: 'URL non autorisée' })
    }

    // Extraire le public_id depuis l'URL Cloudinary
    // Format: https://res.cloudinary.com/CLOUD/image/upload/v123/brandpack-logos/filename
    const cloudinary = require('../config/cloudinary')
    const match = url.match(/\/(?:image|raw)\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)
    if (!match) return res.status(400).json({ message: 'URL invalide' })

    const publicId = match[1]
    const resourceType = url.includes('/raw/') ? 'raw' : 'image'

    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
    res.json({ message: 'Logo supprimé' })
  } catch (error) {
    console.error('Cloudinary logo delete error:', error.message)
    res.status(500).json({ message: error.message })
  }
})