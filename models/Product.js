const mongoose = require('mongoose')

const sizeSchema = new mongoose.Schema({
  size:  { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
})

// Sous-document pour les articles qui composent un pack
const packItemSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true },
  size:        { type: String, required: true },
  quantity:    { type: Number, required: true, min: 1 },
  unitPrice:   { type: Number, required: true, min: 0 },
}, { _id: false })

const productSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['Board', 'Bags', 'Autocollants', 'Paper', 'Pack'],
    },
    sizes:  { type: [sizeSchema], default: [] },
    images: { type: [String],    default: [] },

    colors:                   { type: [String], default: [] },
    colorDesignEnabled:       { type: Boolean, default: false },
    colorDesignPricePerColor: { type: Number, default: 0 },
    colorDesignMaxColors:     { type: Number, default: null },
    doubleSided:              { type: Boolean, default: false },
    doubleSidedPrice:         { type: Number,  default: 0, min: 0 },
    tags:                     { type: [String], default: [] },

    // ── Champs spécifiques aux Packs ─────────────────────────────────────
    packItems:    { type: [packItemSchema], default: [] },
    freeDelivery: { type: Boolean, default: false },   // true pour tous les packs
  },
  { timestamps: true }
)

// ── Middleware : auto-set freeDelivery pour les packs ─────────────────────
productSchema.pre('save', function (next) {
  if (this.category === 'Pack') this.freeDelivery = true
  next()
})

productSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate()
  if (update?.category === 'Pack' || update?.$set?.category === 'Pack') {
    if (update.$set) update.$set.freeDelivery = true
    else update.freeDelivery = true
  }
  next()
})

// ── Index ──────────────────────────────────────────────────────────────────
productSchema.index({ category: 1, createdAt: -1 })
productSchema.index({ name: 'text' })

module.exports = mongoose.model('Product', productSchema)