const mongoose = require('mongoose')

const priceTierSchema = new mongoose.Schema({
  minQty: { type: Number, required: true, min: 1 },
  price:  { type: Number, required: true, min: 0 },
}, { _id: false })

const sizeSchema = new mongoose.Schema({
  size:       { type: String, required: true },
  price:      { type: Number, required: true, min: 0 }, // prix de base (palier 1 ou fallback)
  priceTiers: { type: [priceTierSchema], default: [] },  // paliers dégressifs
})

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
    colorDesignPricePerColor: { type: Number,  default: 0 },
    colorDesignMaxColors:     { type: Number,  default: null },
    doubleSided:              { type: Boolean, default: false },
    doubleSidedPrice:         { type: Number,  default: 0, min: 0 },
    tags:                     { type: [String], default: [] },

    packItems:    { type: [packItemSchema], default: [] },
    freeDelivery: { type: Boolean, default: false },
  },
  { timestamps: true }
)

// ── Middleware Mongoose 9 : async, sans next ───────────────────────────────
productSchema.pre('save', async function () {
  if (this.category === 'Pack') this.freeDelivery = true
})

productSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate()
  if (update?.category === 'Pack' || update?.$set?.category === 'Pack') {
    if (update.$set) update.$set.freeDelivery = true
    else update.freeDelivery = true
  }
})

// ── Index ──────────────────────────────────────────────────────────────────
productSchema.index({ category: 1, createdAt: -1 })
productSchema.index({ name: 'text' })

module.exports = mongoose.model('Product', productSchema)