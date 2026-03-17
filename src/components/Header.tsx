interface HeaderProps {
  isDark: boolean;
  onToggleDarkMode: () => void;
}

export function Header({ isDark, onToggleDarkMode }: HeaderProps) {
  return (
    <header className="console-nameplate relative mb-6 px-6 py-4">
      {/* Model number plate — top-right */}
      <div className="absolute top-3 right-4 flex items-center gap-3">
        {/* Theme toggle — hardware toggle switch style */}
        <button
          onClick={onToggleDarkMode}
          className="btn-hardware flex items-center gap-2 rounded px-3 py-1.5"
          title="Toggle Dark Mode"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: isDark ? '#888' : '#44ff44',
              boxShadow: isDark ? 'none' : '0 0 4px rgba(68,255,68,0.8)',
            }}
          />
          <span className="label-engraved">{isDark ? 'DARK' : 'LIGHT'}</span>
        </button>
      </div>

      {/* Product nameplate */}
      <div className="text-center">
        <h1
          className="text-4xl font-black tracking-[0.12em] uppercase"
          style={{
            color: '#383838',
            textShadow:
              '0 2px 0 rgba(255,255,255,0.7), 0 -1px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.2)',
            fontFamily: '"Courier New", monospace',
            letterSpacing: '0.15em',
          }}
        >
          PhotoReturns
        </h1>
        <p
          className="mt-1 text-xs tracking-[0.2em] uppercase"
          style={{
            color: '#808080',
            textShadow: '0 1px 0 rgba(255,255,255,0.5)',
            fontFamily: '"Courier New", monospace',
          }}
        >
          Take Back Your Memories — Media Organizer &amp; Renamer
        </p>
      </div>

      {/* Bottom rule — machined groove */}
      <div
        className="absolute right-0 bottom-0 left-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, #909090 15%, #909090 85%, transparent)',
        }}
      />
    </header>
  );
}
