'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { CATALOG_TAG, SETTINGS_TAG } from '@/server/queries/catalog'
import {
  addColor,
  addImage,
  addVariants,
  createProduct,
  removeImage,
  saveCategory,
  saveCollection,
  savePolicy,
  saveShippingMethod,
  saveStoreInfo,
  setProductStatus,
  updateProduct,
  updateVariant,
} from '@/server/services/catalog-admin'
import { adjustStock } from '@/server/services/inventory'
import { recordCashPayment, transitionOrder } from '@/server/services/orders'
import { enforceRateLimit, LIMITS } from '@/server/security/rate-limit'
import { uploadProductImage } from '@/server/storage/cloudinary'
import { runAdminAction, type ActionResult } from './run'

// ---- Orders -----------------------------------------------------------------

export async function changeOrderStatusAction(raw: { orderId: string; to: string; note?: string | null }) {
  return runAdminAction('orders.update', async (ctx) => {
    const result = await transitionOrder(ctx, raw)
    if (result.restored > 0) updateTag(CATALOG_TAG)
    return result
  })
}

export async function recordCashPaymentAction(orderId: string) {
  return runAdminAction('orders.update', (ctx) => recordCashPayment(ctx, { orderId }))
}

// ---- Inventory --------------------------------------------------------------

export async function adjustStockAction(raw: unknown) {
  return runAdminAction('inventory.adjust', async (ctx) => {
    const result = await adjustStock(ctx, raw)
    updateTag(CATALOG_TAG)
    return result
  })
}

// ---- Products ---------------------------------------------------------------

export async function createProductAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const res = await runAdminAction('products.edit', async (ctx) => {
    const created = await createProduct(ctx, raw)
    updateTag(CATALOG_TAG)
    return created
  }, { refreshRouter: false })
  if (res.ok) redirect(`/admin/products/${res.data.id}?created=1`)
  return res
}

export async function updateProductAction(productId: string, raw: unknown) {
  return runAdminAction('products.edit', async (ctx) => {
    const result = await updateProduct(ctx, productId, raw)
    updateTag(CATALOG_TAG)
    return result
  })
}

export async function setProductStatusAction(productIds: string[], status: 'draft' | 'active' | 'archived') {
  return runAdminAction('products.edit', async (ctx) => {
    await setProductStatus(ctx, productIds, status)
    updateTag(CATALOG_TAG)
    return null
  })
}

export async function addColorAction(raw: unknown) {
  return runAdminAction('products.edit', async (ctx) => {
    const result = await addColor(ctx, raw)
    updateTag(CATALOG_TAG)
    return result
  })
}

export async function addVariantsAction(raw: unknown) {
  return runAdminAction('products.edit', async (ctx) => {
    const result = await addVariants(ctx, raw)
    updateTag(CATALOG_TAG)
    return result
  })
}

export async function updateVariantAction(raw: unknown) {
  return runAdminAction('products.edit', async (ctx) => {
    const result = await updateVariant(ctx, raw)
    updateTag(CATALOG_TAG)
    return result
  })
}

export async function uploadImageAction(formData: FormData) {
  return runAdminAction('media.upload', async (ctx) => {
    await enforceRateLimit(ctx.db, LIMITS.upload, ctx.actor.userId)
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) throw new Error('No file')
    const productId = String(formData.get('productId') ?? '')
    const colorIdRaw = String(formData.get('colorId') ?? '')
    const alt = String(formData.get('alt') ?? '').trim()
    const uploaded = await uploadProductImage(file)
    const result = await addImage(ctx, {
      productId,
      colorId: colorIdRaw || null,
      url: uploaded.url,
      alt: alt || 'Бүтээгдэхүүний зураг',
      width: uploaded.width,
      height: uploaded.height,
    })
    updateTag(CATALOG_TAG)
    return result
  })
}

export async function removeImageAction(imageId: string) {
  return runAdminAction('products.edit', async (ctx) => {
    await removeImage(ctx, imageId)
    updateTag(CATALOG_TAG)
    return null
  })
}

export async function saveCategoryAction(raw: unknown) {
  return runAdminAction('products.edit', async (ctx) => {
    const result = await saveCategory(ctx, raw)
    updateTag(CATALOG_TAG)
    return result
  })
}

export async function saveCollectionAction(raw: unknown) {
  return runAdminAction('products.edit', async (ctx) => {
    const result = await saveCollection(ctx, raw)
    updateTag(CATALOG_TAG)
    return result
  })
}

// ---- Settings ---------------------------------------------------------------

export async function saveStoreInfoAction(raw: unknown) {
  return runAdminAction('settings.edit', async (ctx) => {
    await saveStoreInfo(ctx, raw)
    updateTag(SETTINGS_TAG)
    return null
  })
}

export async function savePolicyAction(raw: unknown) {
  return runAdminAction('settings.edit', async (ctx) => {
    await savePolicy(ctx, raw)
    updateTag(SETTINGS_TAG)
    return null
  })
}

export async function saveShippingMethodAction(raw: unknown) {
  return runAdminAction('settings.edit', async (ctx) => {
    await saveShippingMethod(ctx, raw)
    updateTag(SETTINGS_TAG)
    return null
  })
}
