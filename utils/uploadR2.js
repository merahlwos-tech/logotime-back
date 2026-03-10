// utils/uploadR2.js  (backend Node.js)
// Upload product images to Cloudflare R2
// npm install @aws-sdk/client-s3 @aws-sdk/lib-storage sharp

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { randomUUID } from 'crypto'

const r2 = new S3Client({
  region:   'auto',
  endpoint: process.env.R2_ENDPOINT,   // https://<account_id>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET     = process.env.R2_BUCKET_NAME
const PUBLIC_URL = process.env.R2_PUBLIC_URL  // https://cdn.brandpack.dz (custom domain R2)

/**
 * Upload a product image buffer to R2
 * Converts to WebP and resizes to max 1200px for optimization
 * Returns the public URL
 */
export async function uploadProductImageToR2(fileBuffer, originalMimetype) {
  const key = `products/${randomUUID()}.webp`

  // Optimize: resize + convert to WebP
  const optimized = await sharp(fileBuffer)
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()

  await r2.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        optimized,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000',  // 1 year cache
  }))

  return `${PUBLIC_URL}/${key}`
}

/**
 * Delete a product image from R2 by its full URL
 */
export async function deleteProductImageFromR2(url) {
  try {
    const key = url.replace(`${PUBLIC_URL}/`, '')
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch (err) {
    console.error('R2 delete error:', err)
  }
}