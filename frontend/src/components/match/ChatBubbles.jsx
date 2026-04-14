export default function ChatBubbles({ bubbles }) {
  return (
    <div className="absolute top-4 right-4 flex flex-col items-end gap-2 pointer-events-none z-10 max-w-[55%]">
      {bubbles.map(b => (
        <div key={b.id} className="chat-bubble-in flex flex-col items-end gap-0.5">
          <span className="text-gray-500 text-[10px] px-1">{b.displayName}</span>
          <div
            className="px-3 py-2 rounded-2xl rounded-tr-sm text-white text-sm leading-snug"
            style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {b.text}
          </div>
        </div>
      ))}
    </div>
  )
}
