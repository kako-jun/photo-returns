import type { ProcessResult, MediaInfo } from '../types';

interface ProcessSummaryProps {
  processResult: ProcessResult;
  mediaList: MediaInfo[];
  onRetryFailed?: () => void;
}

export function ProcessSummary({ mediaList, onRetryFailed }: ProcessSummaryProps) {
  const completedCount = mediaList.filter((item) => item.status === 'completed').length;
  const errorCount = mediaList.filter((item) => item.status === 'error').length;
  const skippedCount = mediaList.filter((item) => item.status === 'no_change').length;

  const errorFiles = mediaList
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === 'error');

  const hasErrors = errorCount > 0;

  const scrollToRow = (index: number) => {
    const element = document.getElementById(`media-row-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const prev = element.style.background;
      element.style.background = '#1a2a1a';
      element.style.boxShadow = '0 0 0 1px rgba(68,255,68,0.3)';
      setTimeout(() => {
        element.style.background = prev;
        element.style.boxShadow = '';
      }, 2000);
    }
  };

  return (
    <section
      className="rounded-sm px-5 py-4"
      style={
        hasErrors
          ? {
              background: 'linear-gradient(180deg, #1a1010, #141010, #100808)',
              borderLeft: '3px solid #ff3333',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6), 0 0 12px rgba(255,51,51,0.06)',
              border: '1px solid #2a1010',
            }
          : {
              background: 'linear-gradient(180deg, #0e1a0e, #0a140a, #080f08)',
              borderLeft: '3px solid #44ff44',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6), 0 0 12px rgba(68,255,68,0.06)',
              border: '1px solid #102010',
            }
      }
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3
            className="led-display mb-3 text-xs font-bold"
            style={{
              color: hasErrors ? '#ff3333' : '#44ff44',
              textShadow: hasErrors ? '0 0 8px rgba(255,51,51,0.5)' : '0 0 8px rgba(68,255,68,0.5)',
              letterSpacing: '0.15em',
            }}
          >
            ▶ PROCESSING COMPLETE
          </h3>

          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: '#44ff44', boxShadow: '0 0 4px rgba(68,255,68,0.8)' }}
              />
              <span
                className="led-display text-xs"
                style={{ color: '#44ff44', letterSpacing: '0.06em' }}
              >
                OK: {String(completedCount).padStart(4, '0')}
              </span>
            </div>

            {skippedCount > 0 && (
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: '#888' }}
                />
                <span
                  className="led-display text-xs"
                  style={{ color: '#888', letterSpacing: '0.06em' }}
                >
                  SKIP: {String(skippedCount).padStart(4, '0')}
                </span>
              </div>
            )}

            {errorCount > 0 && (
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: '#ff3333', boxShadow: '0 0 4px rgba(255,51,51,0.8)' }}
                />
                <span
                  className="led-display text-xs"
                  style={{ color: '#ff3333', letterSpacing: '0.06em' }}
                >
                  ERR: {String(errorCount).padStart(4, '0')}
                </span>
              </div>
            )}
          </div>
        </div>

        {errorCount > 0 && onRetryFailed && (
          <button
            onClick={onRetryFailed}
            className="btn-hardware flex items-center gap-2 rounded px-4 py-2"
            style={{
              borderColor: '#883300',
              background: 'linear-gradient(180deg, #5a2800, #441e00, #5a2800)',
              color: '#ff8844',
              textShadow: '0 0 6px rgba(255,120,50,0.4)',
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: '#ff8844', boxShadow: '0 0 4px rgba(255,136,68,0.8)' }}
            />
            RETRY FAILED
          </button>
        )}
      </div>

      {errorFiles.length > 0 && (
        <details className="mt-4" open>
          <summary
            className="led-display cursor-pointer text-xs font-bold"
            style={{ color: '#ff3333', letterSpacing: '0.1em' }}
          >
            ▼ FAILED FILES [{errorFiles.length}]
          </summary>
          <ul className="mt-2 space-y-1">
            {errorFiles.map(({ item, index }) => (
              <li key={index}>
                <button
                  onClick={() => scrollToRow(index)}
                  className="w-full rounded-sm px-3 py-2 text-left transition-colors"
                  style={{
                    background: 'rgba(255,0,0,0.05)',
                    border: '1px solid rgba(255,51,51,0.15)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,0,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,0,0.05)';
                  }}
                >
                  <span
                    className="led-display block text-xs font-semibold"
                    style={{ color: '#cccccc' }}
                  >
                    {item.file_name}
                  </span>
                  {item.error_message && (
                    <span className="led-display mt-0.5 block text-xs" style={{ color: '#ff6644' }}>
                      {item.error_message}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
