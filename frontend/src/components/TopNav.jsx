export default function TopNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 bg-gray-950 border-b border-gray-800 z-50">
      <div className="flex items-center justify-center gap-3 h-16">
        <img src="/logo.png" alt="" className="h-10" />
        <span
          className="font-stadium text-white/85 leading-none"
          style={{ fontSize: '1.35rem', letterSpacing: '0.1em' }}
        >
          FANTASY
        </span>
      </div>
    </nav>
  )
}
