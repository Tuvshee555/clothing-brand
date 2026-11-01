import { describe, expect, it } from 'vitest'
import { parseColors, parsePriceLimits, parseQuestion, parseSizes } from '@/lib/assistant-parse'

describe('price limits', () => {
  it('reads upper limits written the Mongolian way', () => {
    expect(parsePriceLimits('200,000₮-өөс доош юу байна?').maxPrice).toBe(200_000)
    expect(parsePriceLimits('200000 төгрөгөөс бага').maxPrice).toBe(200_000)
    expect(parsePriceLimits('150 мянга хүртэл').maxPrice).toBe(150_000)
    expect(parsePriceLimits('under 120k').maxPrice).toBe(120_000)
  })
  it('reads lower limits', () => {
    expect(parsePriceLimits('300,000-аас дээш хүрэм').minPrice).toBe(300_000)
  })
  it('ignores sentences without amounts', () => {
    expect(parsePriceLimits('хамгийн хямд хүрэм')).toEqual({ maxPrice: null, minPrice: null })
  })
})

describe('sizes and colours', () => {
  it('finds letter and waist sizes', () => {
    expect(parseSizes('L размер байгаа юу?')).toEqual(['L'])
    expect(parseSizes('XL болон XXL')).toEqual(['XL', 'XXL'])
    expect(parseSizes('32 размер жинс')).toEqual(['32'])
  })
  it('finds colours without mistaking verbs for them', () => {
    expect(parseColors('хар hoodie байна уу')).toEqual(['black'])
    expect(parseColors('саарал свитер')).toEqual(['grey'])
    expect(parseColors('харах уу')).toEqual([])
  })
})

describe('parseQuestion', () => {
  it('recognises policy questions', () => {
    expect(parseQuestion('Хүргэлтийн нөхцөл ямар вэ?').policy).toBe('delivery')
    expect(parseQuestion('Яаж захиалах вэ?').policy).toBe('ordering')
    expect(parseQuestion('Захиалгаа өөрчилж болох уу?').policy).toBe('change_order')
    expect(parseQuestion('Буцааж болох уу').policy).toBe('returns')
    expect(parseQuestion('Хэмжээ солиулж болох уу').policy).toBe('exchange')
  })
  it('extracts constraints and the remaining product words', () => {
    const q = parseQuestion('Хар hoodie L размер байгаа юу?')
    expect(q.colors).toEqual(['black'])
    expect(q.sizes).toEqual(['L'])
    expect(q.stockQuestion).toBe(true)
    expect(q.productQuery).toContain('hoodie')
    expect(parseQuestion('Хамгийн хямд хүрэм аль нь вэ?').cheapest).toBe(true)
    expect(parseQuestion('Эдгээр цамцны ялгаа юу вэ?').compare).toBe(true)
    expect(parseQuestion('Өвөлд ямар хувцас тохирох вэ?').winter).toBe(true)
  })
})
