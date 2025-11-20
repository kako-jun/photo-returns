import { useEffect } from 'react';
import { HiXMark, HiClipboard } from 'react-icons/hi2';
import type { LogEntry } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
  fileName: string;
  onClose: () => void;
}

export function LogViewer({ logs, fileName, onClose }: LogViewerProps) {
  // ESCキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ログをテキストとしてコピー
  const copyLogsToClipboard = () => {
    const logText = logs
      .map((log) => `[${log.timestamp}] [${log.level}] ${log.message}`)
      .join('\n');

    navigator.clipboard
      .writeText(logText)
      .then(() => {
        alert('Logs copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy logs:', err);
        alert('Failed to copy logs to clipboard');
      });
  };

  // ログレベルに応じた色設定
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Info':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'Warning':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20';
      case 'Error':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  return (
    <div
      className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Processing Logs</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              File: <span className="font-mono">{fileName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLogsToClipboard}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white shadow-sm transition-colors hover:bg-blue-600 hover:shadow-md"
              title="Copy logs to clipboard"
            >
              <HiClipboard className="h-5 w-5" />
              Copy
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Close (ESC)"
            >
              <HiXMark className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-auto p-6">
          {logs.length === 0 ? (
            <p className="py-10 text-center text-gray-400 dark:text-gray-500">
              No logs available for this file.
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`rounded-lg border p-3 ${getLevelColor(log.level)} border-current/20`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-xs whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {log.timestamp}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${getLevelColor(log.level)}`}
                    >
                      {log.level}
                    </span>
                    <p className="flex-1 text-sm break-words text-gray-800 dark:text-gray-200">
                      {log.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rounded-b-xl border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Total: {logs.length} log {logs.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
      </div>
    </div>
  );
}
