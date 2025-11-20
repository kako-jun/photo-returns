import type { ProcessResult, MediaInfo } from '../types';

interface ProcessSummaryProps {
  processResult: ProcessResult;
  mediaList: MediaInfo[];
  onRetryFailed?: () => void;
}

export function ProcessSummary({ mediaList, onRetryFailed }: ProcessSummaryProps) {
  // ステータス別にカウント
  const completedCount = mediaList.filter((item) => item.status === 'completed').length;
  const errorCount = mediaList.filter((item) => item.status === 'error').length;
  const skippedCount = mediaList.filter((item) => item.status === 'no_change').length;

  // エラーファイルのみ抽出
  const errorFiles = mediaList
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === 'error');

  const scrollToRow = (index: number) => {
    const element = document.getElementById(`media-row-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // ハイライト効果
      element.classList.add('ring-4', 'ring-blue-400', 'dark:ring-blue-500');
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-blue-400', 'dark:ring-blue-500');
      }, 2000);
    }
  };

  return (
    <section className="mb-5 rounded-lg border-l-4 border-green-600 bg-green-50 p-5 dark:bg-green-900/20">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="mb-3 font-semibold text-green-700 dark:text-green-400">
            Processing Complete
          </h3>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-green-600 dark:text-green-400">✓ Processed:</span>
              <span className="font-mono text-gray-900 dark:text-gray-100">
                {completedCount} files
              </span>
            </div>

            {skippedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-600 dark:text-gray-400">⊘ Skipped:</span>
                <span className="font-mono text-gray-900 dark:text-gray-100">
                  {skippedCount} files (no change)
                </span>
              </div>
            )}

            {errorCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-red-600 dark:text-red-400">✗ Failed:</span>
                <span className="font-mono text-gray-900 dark:text-gray-100">
                  {errorCount} files
                </span>
              </div>
            )}
          </div>
        </div>

        {errorCount > 0 && onRetryFailed && (
          <button
            onClick={onRetryFailed}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 hover:shadow-md"
          >
            Retry Failed Files
          </button>
        )}
      </div>

      {errorFiles.length > 0 && (
        <details className="mt-4" open>
          <summary className="cursor-pointer font-semibold text-red-600 dark:text-red-400">
            Failed Files ({errorFiles.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {errorFiles.map(({ item, index }) => (
              <li key={index}>
                <button
                  onClick={() => scrollToRow(index)}
                  className="w-full rounded px-3 py-2 text-left transition-colors hover:bg-red-100 dark:hover:bg-red-900/30"
                >
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {item.file_name}
                  </span>
                  {item.error_message && (
                    <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
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
