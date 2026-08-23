import { useEffect } from 'react';
import { HiXMark, HiClipboard } from 'react-icons/hi2';
import type { LogEntry } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
  fileName: string;
  onClose: () => void;
  /**
   * フッターの表示テキストを差し替える（#28）。省略時は従来どおり
   * `TOTAL: {logs.length} ENTRIES` を表示する（ファイル単位ログ表示の既定挙動は不変）。
   * 除外内訳表示のように `logs.length` が実際の件数と一致しない呼び出し元向け。
   */
  footerText?: string;
}

export function LogViewer({ logs, fileName, onClose, footerText }: LogViewerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const copyLogsToClipboard = () => {
    const logText = logs
      .map((log) => `[${log.timestamp}] [${log.level}] ${log.message}`)
      .join('\n');
    navigator.clipboard
      .writeText(logText)
      .then(() => alert('Logs copied to clipboard!'))
      .catch((err) => {
        console.error('Failed to copy logs:', err);
        alert('Failed to copy logs to clipboard');
      });
  };

  const getLevelStyle = (level: string): React.CSSProperties => {
    switch (level) {
      case 'Info':
        return {
          color: '#44aaff',
          borderColor: 'rgba(68,170,255,0.2)',
          background: 'rgba(68,170,255,0.05)',
        };
      case 'Warning':
        return {
          color: '#ffaa00',
          borderColor: 'rgba(255,170,0,0.2)',
          background: 'rgba(255,170,0,0.05)',
        };
      case 'Error':
        return {
          color: '#ff3333',
          borderColor: 'rgba(255,51,51,0.2)',
          background: 'rgba(255,51,51,0.05)',
        };
      default:
        return {
          color: '#888',
          borderColor: 'rgba(128,128,128,0.2)',
          background: 'rgba(128,128,128,0.04)',
        };
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-sm"
        style={{
          background: 'linear-gradient(180deg, #1a1a1a, #141414)',
          border: '1px solid #333',
          borderTop: '2px solid #555',
          boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{
            background: 'linear-gradient(180deg, #282828, #1e1e1e)',
            borderBottom: '1px solid #0a0a0a',
          }}
        >
          <div>
            <h2
              className="led-display text-sm font-bold"
              style={{ color: '#c0c0c0', letterSpacing: '0.15em' }}
            >
              PROCESSING LOGS
            </h2>
            <p className="mt-0.5 font-mono text-xs" style={{ color: '#555' }}>
              FILE: <span style={{ color: '#888' }}>{fileName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLogsToClipboard}
              className="btn-hardware flex items-center gap-2 rounded px-3 py-1.5"
              title="Copy logs to clipboard"
            >
              <HiClipboard className="h-4 w-4" />
              <span>COPY</span>
            </button>
            <button onClick={onClose} className="expand-btn rounded p-1.5" title="Close (ESC)">
              <HiXMark className="h-5 w-5" style={{ color: '#888' }} />
            </button>
          </div>
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-auto p-4" style={{ background: '#0c0c0c' }}>
          {logs.length === 0 ? (
            <p
              className="led-display py-10 text-center text-xs"
              style={{ color: '#2a2a2a', letterSpacing: '0.1em' }}
            >
              — NO LOG ENTRIES —
            </p>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => {
                const style = getLevelStyle(log.level);
                return (
                  <div
                    key={index}
                    className="rounded-sm border px-3 py-2"
                    style={{
                      background: style.background,
                      borderColor: style.borderColor,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="led-display mt-0.5 flex-shrink-0 text-xs"
                        style={{ color: '#444', letterSpacing: '0.02em', minWidth: '80px' }}
                      >
                        {log.timestamp}
                      </span>
                      <span
                        className="led-display flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-bold"
                        style={{
                          color: style.color,
                          background: style.background,
                          border: `1px solid ${style.borderColor}`,
                          letterSpacing: '0.1em',
                          minWidth: '56px',
                          textAlign: 'center',
                          textShadow: index < 3 ? `0 0 6px ${style.color}60` : 'none',
                        }}
                      >
                        {log.level.toUpperCase()}
                      </span>
                      <p
                        className="led-display flex-1 text-xs break-words"
                        style={{ color: '#aaa' }}
                      >
                        {log.message}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-2.5"
          style={{
            background: 'linear-gradient(180deg, #181818, #141414)',
            borderTop: '1px solid #222',
          }}
        >
          <p
            className="led-display text-center text-xs"
            style={{ color: '#444', letterSpacing: '0.1em' }}
          >
            {footerText ?? `TOTAL: ${logs.length} ${logs.length === 1 ? 'ENTRY' : 'ENTRIES'}`}
          </p>
        </div>
      </div>
    </div>
  );
}
