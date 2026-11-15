// Server-rendered horizontal bars (no client JS) for the chatbot analytics.

export function BarList({ rows, empty = 'Мэдээлэл алга.', format = (n: number) => String(n) }: { rows: { label: string; value: number; hint?: string }[]; empty?: string; format?: (n: number) => string }) {
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return <p className="text-[13px] text-stone-600">{empty}</p>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-[12.5px]">
          <div className="mb-1 flex justify-between gap-3">
            <span>{r.label}</span>
            <span className="tabular text-stone-600">
              {format(r.value)}
              {r.hint ? ` · ${r.hint}` : ''}
            </span>
          </div>
          <div className="h-2 rounded-full bg-paper-2" aria-hidden>
            <div className="h-2 rounded-full bg-ink" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
