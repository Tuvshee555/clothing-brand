import { formatMoney } from '@/lib/money'

/** Daily bars for the last N days (server-rendered SVG, no client JS). */
export function DailyBars({ days, data }: { days: number; data: { day: string; revenue: number; orders: number }[] }) {
  const today = new Date(Date.now() + 8 * 3_600_000) // Ulaanbaatar date
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - (days - 1 - i))
    const key = d.toISOString().slice(0, 10)
    const row = data.find((r) => r.day === key)
    return { key, label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 }
  })
  const max = Math.max(1, ...series.map((s) => s.revenue))
  const W = 640
  const H = 180
  const gap = 6
  const bw = (W - gap * (days - 1)) / days
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label="Сүүлийн 14 хоногийн захиалгын дүн">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={H - H * f} y2={H - H * f} stroke="#ebe7e0" strokeWidth={1} />
        ))}
        {series.map((s, i) => {
          const h = s.revenue > 0 ? Math.max(3, (s.revenue / max) * (H - 8)) : 0
          const x = i * (bw + gap)
          return (
            <g key={s.key}>
              <title>{`${s.label}: ${formatMoney(s.revenue)} · ${s.orders} захиалга`}</title>
              <rect x={x} y={H - h} width={bw} height={h} rx={3} fill={i === days - 1 ? '#161514' : '#b3a99c'} />
              {i % 2 === 0 && (
                <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize={10} fill="#6c655d">
                  {s.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="sr-only">
        {series.map((s) => `${s.label}: ${formatMoney(s.revenue)}`).join(', ')}
      </figcaption>
    </figure>
  )
}
