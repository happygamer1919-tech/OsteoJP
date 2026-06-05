export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3"
            style={{ backgroundColor: '#45B9A7' }}
          >
            <span className="text-white font-medium text-lg">O</span>
          </div>
          <h1 className="text-xl font-medium text-gray-900">OsteoJP</h1>
          <p className="text-sm text-gray-500 mt-1">Portal do Paciente</p>
        </div>
        {children}
      </div>
    </div>
  )
}
