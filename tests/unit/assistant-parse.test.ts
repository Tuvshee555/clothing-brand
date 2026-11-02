import { describe, expect, it } from 'vitest'
import { parsePriceLimits } from '@/lib/assistant-parse'

describe('parsePriceLimits', () => {
  it('reads Mongolian and English price limits', () => {
    expect(parsePriceLimits('200,000₮-өөс доош ямар бараа байна?').maxPrice).toBe(200_000)
    expect(parsePriceLimits('150 мянга хүртэл').maxPrice).toBe(150_000)
    expect(parsePriceLimits('300000₮-аас дээш').minPrice).toBe(300_000)
    expect(parsePriceLimits('under 150k').maxPrice).toBe(150_000)
    expect(parsePriceLimits('200 000 төгрөгөөс бага').maxPrice).toBe(200_000)
  })

  it('ignores small numbers that are not prices', () => {
    expect(parsePriceLimits('3 хоногийн дотор').maxPrice).toBeNull()
    expect(parsePriceLimits('L размер').maxPrice).toBeNull()
  })
})
