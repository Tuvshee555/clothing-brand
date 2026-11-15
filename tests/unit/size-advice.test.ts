import { describe, expect, it } from 'vitest'
import { bodyMeasure } from '@/server/assistant/answers'

const TOPS = ['Цээж (см)', 'Урт (см)', 'Мөр (см)']
const BOTTOMS = ['Бүсэлхий (см)', 'Ташаа (см)', 'Хөлийн урт (см)']

describe('bodyMeasure', () => {
  it('reads a chest, waist or hip measurement in either word order', () => {
    expect(bodyMeasure('Цээж 98 см, hoodie ямар размер авах вэ?', TOPS)).toEqual({ column: 'Цээж (см)', cm: 98 })
    expect(bodyMeasure('цээжний тойрог маань 104', TOPS)).toEqual({ column: 'Цээж (см)', cm: 104 })
    expect(bodyMeasure('98см цээжтэй хүнд аль нь вэ', TOPS)).toEqual({ column: 'Цээж (см)', cm: 98 })
    expect(bodyMeasure('бүсэлхий 78, ташаа 97 см', BOTTOMS)).toEqual({ column: 'Бүсэлхий (см)', cm: 78 })
    expect(bodyMeasure('my waist is 80 cm', BOTTOMS)).toEqual({ column: 'Бүсэлхий (см)', cm: 80 })
  })

  it('never reads height or weight, or a measure the chart has no column for', () => {
    expect(bodyMeasure('Би 175 см, 70 кг. Аль размер авах вэ?', TOPS)).toBeNull()
    expect(bodyMeasure('Цээж 98 см', BOTTOMS)).toBeNull()
    expect(bodyMeasure('shipping 30 days?', BOTTOMS)).toBeNull()
  })
})
