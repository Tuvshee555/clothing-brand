import { describe, expect, it } from 'vitest'
import { compareSizes, productAvailability, variantAvailability } from '@/lib/catalog'
import { catalogQuery, parseCatalogParams } from '@/lib/catalog-params'
import { formatMoney, parseMoneyInput, shippingFeeFor, variantPrice } from '@/lib/money'
import { canTransition, nextStatuses, restoresStock } from '@/lib/orders'
import { maskPhone, normalizePhone } from '@/lib/phone'
import { hasPermission } from '@/lib/roles'
import { skuPart, slugify } from '@/lib/slug'
import { amountsIn, stockCountsIn } from '@/lib/fact-check'

describe('money', () => {
  it('formats tögrög with grouping', () => {
    expect(formatMoney(219000)).toBe('219,000₮')
    expect(formatMoney(1250000)).toBe('1,250,000₮')
    expect(parseMoneyInput('125,000₮')).toBe(125000)
    expect(parseMoneyInput('abc')).toBeNull()
  })
  it('uses the variant override, else the base price', () => {
    expect(variantPrice(219000, null)).toBe(219000)
    expect(variantPrice(219000, 229000)).toBe(229000)
  })
  it('makes delivery free at the threshold, not below', () => {
    const m = { fee: 6000, freeThreshold: 200000 }
    expect(shippingFeeFor(199999, m)).toBe(6000)
    expect(shippingFeeFor(200000, m)).toBe(0)
    expect(shippingFeeFor(500000, { fee: 10000, freeThreshold: null })).toBe(10000)
  })
})

describe('order status machine', () => {
  it('allows only forward moves and cancellation before shipping', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true)
    expect(canTransition('pending', 'shipped')).toBe(false)
    expect(canTransition('shipped', 'cancelled')).toBe(false)
    expect(canTransition('delivered', 'pending')).toBe(false)
    expect(nextStatuses('cancelled')).toEqual([])
  })
  it('returns stock only on cancellation', () => {
    expect(restoresStock('processing', 'cancelled')).toBe(true)
    expect(restoresStock('pending', 'confirmed')).toBe(false)
  })
})

describe('availability', () => {
  it('derives variant and product availability from stock', () => {
    expect(variantAvailability({ stock: 0, lowStockThreshold: 1, isActive: true })).toBe('out_of_stock')
    expect(variantAvailability({ stock: 1, lowStockThreshold: 1, isActive: true })).toBe('low_stock')
    expect(variantAvailability({ stock: 5, lowStockThreshold: 1, isActive: false })).toBe('unavailable')
    expect(productAvailability([{ stock: 0, lowStockThreshold: 1, isActive: true }])).toBe('out_of_stock')
    expect(compareSizes('XS', 'XL')).toBeLessThan(0)
    expect(['L', 'S', 'ONE SIZE', 'M'].sort(compareSizes)).toEqual(['S', 'M', 'L', 'ONE SIZE'])
  })
})

describe('catalogue URL params', () => {
  it('keeps only valid values', () => {
    const f = parseCatalogParams({ size: 'm,l,<script>', color: 'black,purple', price: 'u100', stock: '1', sort: 'drop table', q: ' hoodie ' })
    expect(f.sizes).toEqual(['M', 'L'])
    expect(f.colors).toEqual(['black'])
    expect(f.price).toBe('u100')
    expect(f.inStockOnly).toBe(true)
    expect(f.sort).toBe('featured')
    expect(f.q).toBe('hoodie')
    expect(catalogQuery({ sizes: ['M'], colors: ['black'], sort: 'price-asc' })).toBe('?size=M&color=black&sort=price-asc')
  })
})

describe('phones, slugs, permissions', () => {
  it('normalises Mongolian phone numbers', () => {
    expect(normalizePhone('+976 9911-2233')).toBe('99112233')
    expect(normalizePhone('1234')).toBeNull()
    expect(maskPhone('99112233')).toBe('99•• ••33')
  })
  it('slugifies Mongolian names', () => {
    expect(slugify('Ноолууран свитер')).toBe('nooluuran-sviter')
    expect(skuPart('grey-marl', 6)).toBe('GREYMA')
  })
  it('keeps the public demo read-only for catalogue, stock and settings', () => {
    expect(hasPermission('demo', 'orders.update')).toBe(true)
    expect(hasPermission('demo', 'products.edit')).toBe(false)
    expect(hasPermission('demo', 'inventory.adjust')).toBe(false)
    expect(hasPermission('demo', 'settings.edit')).toBe(false)
    expect(hasPermission('demo', 'media.upload')).toBe(false)
    expect(hasPermission('owner', 'settings.edit')).toBe(true)
    expect(hasPermission('staff', 'products.edit')).toBe(false)
  })
})

describe('assistant fact check helpers', () => {
  it('finds money amounts and stock counts in a reply', () => {
    expect(amountsIn('Үнэ нь 219,000₮, хүргэлт 6 000 төгрөг, нийт 225 мянга')).toEqual([219000, 6000, 225000])
    expect(stockCountsIn('L размер 4 ширхэг, M 2 ширхэг үлдсэн')).toEqual([4, 2])
  })
})
