// Delivery areas used at checkout. Ulaanbaatar deliveries pick a district;
// countryside deliveries pick a province (sent with intercity transport).

export const UB_DISTRICTS = [
  'Баянгол',
  'Баянзүрх',
  'Сонгинохайрхан',
  'Сүхбаатар',
  'Хан-Уул',
  'Чингэлтэй',
  'Налайх',
  'Багануур',
  'Багахангай',
] as const

export const PROVINCES = [
  'Архангай',
  'Баян-Өлгий',
  'Баянхонгор',
  'Булган',
  'Говь-Алтай',
  'Говьсүмбэр',
  'Дархан-Уул',
  'Дорноговь',
  'Дорнод',
  'Дундговь',
  'Завхан',
  'Орхон',
  'Өвөрхангай',
  'Өмнөговь',
  'Сүхбаатар',
  'Сэлэнгэ',
  'Төв',
  'Увс',
  'Ховд',
  'Хөвсгөл',
  'Хэнтий',
] as const

export type Region = 'ub' | 'countryside'

export function areasFor(region: Region): readonly string[] {
  return region === 'ub' ? UB_DISTRICTS : PROVINCES
}

export function isValidArea(region: Region, area: string): boolean {
  return areasFor(region).includes(area)
}
