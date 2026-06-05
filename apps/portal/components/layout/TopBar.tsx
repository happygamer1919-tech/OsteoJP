export default function TopBar() {
  return (
    <header
      className="w-full px-4 py-3 flex items-center justify-between"
      style={{ backgroundColor: '#45B9A7' }}
    >
      <span className="text-white font-medium text-base tracking-tight">OsteoJP</span>
      <span className="text-white/75 text-xs flex items-center gap-1">
        Portal do Paciente
      </span>
    </header>
  )
}
