const mongoose = require('mongoose')

const sizeSchema = new mongoose.Schema({
  size:  { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
})

const productSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['Board', 'Bags', 'Autocollants', 'Paper'],
    },
    sizes:  { type: [sizeSchema], default: [] },
    images: { type: [String],    default: [] },

    // Options d'impression
    colors:           { type: [String], default: [] },
    doubleSided:      { type: Boolean,  default: false },
    doubleSidedPrice: { type: Number,   default: 0, min: 0 },

    // Conservé pour les collections spéciales
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Product', productSchema)