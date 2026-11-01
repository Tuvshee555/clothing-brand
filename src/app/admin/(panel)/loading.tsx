export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Ачааллаж байна">
      <div className="h-8 w-56 rounded-lg bg-white" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-white" />
        ))}
      </div>
      <div className="h-80 rounded-xl bg-white" />
    </div>
  )
}
