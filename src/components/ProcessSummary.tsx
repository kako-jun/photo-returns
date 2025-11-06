import type { ProcessResult, MediaInfo } from "../types";

interface ProcessSummaryProps {
  processResult: ProcessResult;
  mediaList: MediaInfo[];
}

export function ProcessSummary({ processResult, mediaList }: ProcessSummaryProps) {
  // Falsyなステータス（pending, error）を持つファイルを抽出
  const problemFiles = mediaList
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === "pending" || item.status === "error");

  const scrollToRow = (index: number) => {
    const element = document.getElementById(`media-row-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      // ハイライト効果
      element.classList.add("ring-4", "ring-blue-400", "dark:ring-blue-500");
      setTimeout(() => {
        element.classList.remove("ring-4", "ring-blue-400", "dark:ring-blue-500");
      }, 2000);
    }
  };

  return (
    <section className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 mb-5 border-l-4 border-green-600">
      <h3 className="text-green-700 dark:text-green-400 font-semibold mb-2">Process Summary</h3>
      <p className="text-gray-800 dark:text-gray-200">
        {processResult.processed_files} / {processResult.total_files} files processed successfully
      </p>
      {problemFiles.length > 0 && (
        <details className="mt-3" open>
          <summary className="cursor-pointer font-semibold text-orange-600 dark:text-orange-400">
            Items Requiring Attention ({problemFiles.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {problemFiles.map(({ item, index }) => (
              <li key={index}>
                <button
                  onClick={() => scrollToRow(index)}
                  className="text-left w-full px-3 py-2 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                >
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mr-2 ${
                    item.status === "error"
                      ? "bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300"
                      : "bg-orange-200 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300"
                  }`}>
                    {item.status}
                  </span>
                  <span className="text-gray-900 dark:text-gray-100">{item.file_name}</span>
                  {item.error_message && (
                    <span className="block text-xs text-gray-600 dark:text-gray-400 ml-2 mt-1">
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
