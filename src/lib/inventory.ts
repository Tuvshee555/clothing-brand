// Inventory ledger vocabulary (isomorphic).

export type InventoryReason = 'initial' | 'order_reserved' | 'order_cancelled' | 'restock' | 'adjustment' | 'damaged' | 'return'

/** Reasons a person can choose when adjusting stock by hand. */
export type StockReason = 'restock' | 'adjustment' | 'damaged' | 'return'

export const INVENTORY_REASON_LABELS: Record<InventoryReason, string> = {
  initial: 'Анхны үлдэгдэл',
  order_reserved: 'Захиалгад нөөцөлсөн',
  order_cancelled: 'Цуцлагдсан захиалгаас буцсан',
  restock: 'Шинээр орлого авсан',
  adjustment: 'Тооллогын залруулга',
  damaged: 'Гэмтэл, гологдол',
  return: 'Худалдан авагч буцаасан',
}

export const STOCK_REASON_OPTIONS: { value: StockReason; label: string }[] = [
  { value: 'restock', label: INVENTORY_REASON_LABELS.restock },
  { value: 'adjustment', label: INVENTORY_REASON_LABELS.adjustment },
  { value: 'damaged', label: INVENTORY_REASON_LABELS.damaged },
  { value: 'return', label: INVENTORY_REASON_LABELS.return },
]
