import { HiOutlineFolderOpen } from 'react-icons/hi2';

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
        <label className="min-w-[130px] font-semibold text-gray-700 dark:text-gray-300">
          Input Directory:
        </label>
        <input
          type="text"
          value={inputDir}
          readOnly
          placeholder="Select folder..."
          className="flex-1 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <button
          onClick={onSelectInputDir}
          className="flex items-center gap-2 rounded bg-blue-500 px-5 py-2 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-600 hover:shadow-md active:scale-95"
        >
          <HiOutlineFolderOpen className="h-5 w-5" />
          Browse
        </button>
      </div>
      <div className="flex items-center gap-3">
        <label className="min-w-[130px] font-semibold text-gray-700 dark:text-gray-300">
          Output Directory:
        </label>
        <input
          type="text"
          value={outputDir}
          readOnly
          placeholder="Select folder..."
          className="flex-1 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <button
          onClick={onSelectOutputDir}
          className="flex items-center gap-2 rounded bg-blue-500 px-5 py-2 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-600 hover:shadow-md active:scale-95"
        >
          <HiOutlineFolderOpen className="h-5 w-5" />
          Browse
        </button>
      </div>
    </div>
  );
}
