import { HiOutlineFolderOpen } from "react-icons/hi2";

interface DirectorySelectionProps {
  inputDir: string;
  outputDir: string;
  onSelectInputDir: () => void;
  onSelectOutputDir: () => void;
}

export function DirectorySelection({
  inputDir,
  outputDir,
  onSelectInputDir,
  onSelectOutputDir,
}: DirectorySelectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="min-w-[130px] font-semibold text-gray-700 dark:text-gray-300">Input Directory:</label>
        <input
          type="text"
          value={inputDir}
          readOnly
          placeholder="Select folder..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
        />
        <button
          onClick={onSelectInputDir}
          className="px-5 py-2 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded font-semibold transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2"
        >
          <HiOutlineFolderOpen className="w-5 h-5" />
          Browse
        </button>
      </div>
      <div className="flex items-center gap-3">
        <label className="min-w-[130px] font-semibold text-gray-700 dark:text-gray-300">Output Directory:</label>
        <input
          type="text"
          value={outputDir}
          readOnly
          placeholder="Select folder..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
        />
        <button
          onClick={onSelectOutputDir}
          className="px-5 py-2 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded font-semibold transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2"
        >
          <HiOutlineFolderOpen className="w-5 h-5" />
          Browse
        </button>
      </div>
    </div>
  );
}
