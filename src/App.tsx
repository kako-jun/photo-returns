import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { HiOutlineFolderOpen, HiOutlineMagnifyingGlass, HiOutlineCog, HiOutlineMoon, HiOutlineSun } from "react-icons/hi2";
import "./App.css";
import { MOCK_ENABLED, mockMediaList, mockProcessResult } from "./mock-data";

// Rust側のMediaInfo型に対応
export interface MediaInfo {
  original_path: string;
  file_name: string;
  media_type: "Photo" | "Video";
  date_taken: string | null;
  new_name: string;
  new_path: string;
  file_size: number;
  burst_group_id: number | null;
  burst_index: number | null;
  progress?: number; // 進捗（0-100）
  status?: "pending" | "processing" | "completed" | "error";
  error_message?: string;
}

export interface ProcessResult {
  success: boolean;
  total_files: number;
  processed_files: number;
  media: MediaInfo[];
  errors: string[];
}

const columnHelper = createColumnHelper<MediaInfo>();

function App() {
  const [isDark, setIsDark] = useState(() => {
    // ローカルストレージから読み込む（デフォルトはライトモード）
    return localStorage.getItem("theme") === "dark";
  });
  const [inputDir, setInputDir] = useState<string>(MOCK_ENABLED ? "C:\\Photos" : "");
  const [outputDir, setOutputDir] = useState<string>(MOCK_ENABLED ? "C:\\Output" : "");
  const [mediaList, setMediaList] = useState<MediaInfo[]>(MOCK_ENABLED ? mockMediaList : []);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(
    MOCK_ENABLED ? mockProcessResult : null
  );

  // ダークモード切り替え
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const toggleDarkMode = () => {
    setIsDark(!isDark);
  };

  // フォルダ選択
  const selectInputDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Input Directory",
    });
    if (selected) {
      setInputDir(selected as string);
    }
  };

  const selectOutputDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Output Directory",
    });
    if (selected) {
      setOutputDir(selected as string);
    }
  };

  // スキャン
  const scanMedia = async () => {
    if (!inputDir) {
      alert("Please select input directory");
      return;
    }

    setIsScanning(true);
    try {
      const result = await invoke<MediaInfo[]>("scan_media", {
        inputDir,
        includeVideos: true,
        parallel: true,
      });

      // 初期ステータスを設定
      const mediaWithStatus = result.map((item) => ({
        ...item,
        progress: 0,
        status: "pending" as const,
      }));

      setMediaList(mediaWithStatus);
    } catch (error) {
      console.error("Scan error:", error);
      alert(`Scan error: ${error}`);
    } finally {
      setIsScanning(false);
    }
  };

  // 処理実行
  const processMedia = async () => {
    if (!inputDir || !outputDir) {
      alert("Please select both input and output directories");
      return;
    }

    if (mediaList.length === 0) {
      alert("No media files to process. Please scan first.");
      return;
    }

    setIsProcessing(true);
    setProcessResult(null);

    try {
      const result = await invoke<ProcessResult>("process_media", {
        inputDir,
        outputDir,
        backupDir: null,
        includeVideos: true,
        parallel: true,
        timezoneOffset: null,
        cleanupTemp: true,
        autoCorrectOrientation: true,
      });

      setProcessResult(result);

      // 処理結果を反映
      const updatedMedia = mediaList.map((item) => {
        const processed = result.media.find(
          (m) => m.original_path === item.original_path
        );
        return {
          ...item,
          progress: 100,
          status: processed?.new_path ? ("completed" as const) : ("error" as const),
          new_path: processed?.new_path || "",
        };
      });

      setMediaList(updatedMedia);
    } catch (error) {
      console.error("Process error:", error);
      alert(`Process error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // テーブルのカラム定義
  const columns = [
    columnHelper.accessor("media_type", {
      header: "Type",
      cell: (info) => (
        <span
          className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
            info.getValue() === "Photo"
              ? "bg-blue-500 text-white"
              : "bg-purple-600 text-white"
          }`}
        >
          {info.getValue()}
        </span>
      ),
      size: 80,
    }),
    columnHelper.accessor("file_name", {
      header: "Original Name",
      cell: (info) => <span className="text-gray-900 dark:text-gray-100" title={info.row.original.original_path}>{info.getValue()}</span>,
      size: 250,
    }),
    columnHelper.accessor("new_name", {
      header: "New Name",
      cell: (info) => <span className="font-mono text-green-600 dark:text-green-400 font-semibold">{info.getValue()}</span>,
      size: 200,
    }),
    columnHelper.accessor("date_taken", {
      header: "Date Taken",
      cell: (info) => {
        const date = info.getValue();
        if (!date) return <span className="text-gray-900 dark:text-gray-100">N/A</span>;

        const d = new Date(date);
        const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return <span className="text-gray-900 dark:text-gray-100 font-mono">{formatted}</span>;
      },
      size: 180,
    }),
    columnHelper.accessor("file_size", {
      header: "Size",
      cell: (info) => {
        const size = info.getValue();
        const formatted = size > 1024 * 1024
          ? `${(size / (1024 * 1024)).toFixed(1)} MB`
          : `${(size / 1024).toFixed(1)} KB`;
        return <span className="text-gray-900 dark:text-gray-100">{formatted}</span>;
      },
      size: 100,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue() || "pending";
        const statusColors = {
          pending: "bg-orange-500 text-white",
          processing: "bg-blue-500 text-white",
          completed: "bg-green-600 text-white",
          error: "bg-red-600 text-white",
        };
        return (
          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold uppercase ${statusColors[status]}`}>
            {status}
          </span>
        );
      },
      size: 100,
    }),
    columnHelper.display({
      id: "progress",
      header: "Progress",
      cell: (info) => {
        const progress = info.row.original.progress || 0;
        const status = info.row.original.status || "pending";
        const progressColors = {
          pending: "bg-orange-500",
          processing: "bg-blue-500",
          completed: "bg-green-600",
          error: "bg-red-600",
        };
        return (
          <div className="relative w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressColors[status]}`}
              style={{ width: `${progress}%` }}
            ></div>
            <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xs font-semibold text-gray-800 dark:text-gray-100">
              {progress}%
            </span>
          </div>
        );
      },
      size: 120,
    }),
  ];

  const table = useReactTable({
    data: mediaList,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="min-h-screen flex flex-col p-5 max-w-7xl mx-auto bg-gray-50 dark:bg-gray-900">
      {MOCK_ENABLED && (
        <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-500 rounded">
          <p className="text-yellow-800 dark:text-yellow-300 font-semibold">
            🎨 モックモード - ブラウザでのUI開発用（Tauri APIは無効）
          </p>
        </div>
      )}
      <header className="text-center mb-8 pb-5 border-b-2 border-gray-300 dark:border-gray-700 relative">
        <button
          onClick={toggleDarkMode}
          className="absolute top-0 right-0 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 active:scale-95 text-gray-800 dark:text-gray-200 font-semibold transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2"
          title="ダークモード切り替え"
        >
          {isDark ? (
            <>
              <HiOutlineSun className="w-5 h-5" />
              ライト
            </>
          ) : (
            <>
              <HiOutlineMoon className="w-5 h-5" />
              ダーク
            </>
          )}
        </button>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-2">
          PhotoReturns
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 italic">Take back your memories</p>
      </header>

      <section className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <div className="flex flex-col gap-5">
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
                onClick={selectInputDir}
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
                onClick={selectOutputDir}
                className="px-5 py-2 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded font-semibold transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2"
              >
                <HiOutlineFolderOpen className="w-5 h-5" />
                Browse
              </button>
            </div>
          </div>

          <div className="flex gap-4 justify-center pt-2">
            <button
              onClick={scanMedia}
              disabled={!inputDir || isScanning}
              className="px-6 py-3 text-base font-semibold rounded-lg transition-all bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-white shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <HiOutlineMagnifyingGlass className="w-5 h-5" />
              {isScanning ? "Scanning..." : "Scan Media Files"}
            </button>
            <button
              onClick={processMedia}
              disabled={!inputDir || !outputDir || mediaList.length === 0 || isProcessing}
              className="px-6 py-3 text-base font-semibold rounded-lg transition-all bg-green-600 hover:bg-green-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-white shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <HiOutlineCog className={`w-5 h-5 ${isProcessing ? 'animate-spin' : ''}`} />
              {isProcessing ? "Processing..." : "Process & Rename"}
            </button>
          </div>
        </div>
      </section>

      {processResult && (
        <section className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 mb-5 border-l-4 border-green-600">
          <h3 className="text-green-700 dark:text-green-400 font-semibold mb-2">Process Summary</h3>
          <p className="text-gray-800 dark:text-gray-200">
            Total: {processResult.total_files} | Processed: {processResult.processed_files} |{" "}
            Success: {processResult.success ? "✓" : "✗"}
          </p>
          {processResult.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold text-red-600 dark:text-red-400">
                Errors ({processResult.errors.length})
              </summary>
              <ul className="mt-2 pl-5 list-disc">
                {processResult.errors.map((err, i) => (
                  <li key={i} className="text-red-700 dark:text-red-300 my-1">{err}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <h3 className="text-gray-800 dark:text-gray-100 font-semibold mb-4">Media Files ({mediaList.length})</h3>
        {mediaList.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-gray-500 py-10 text-lg">
            No media files scanned yet. Select a folder and click "Scan Media Files".
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-700 dark:bg-gray-900 text-white">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className="px-2 py-3 text-left font-semibold"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors ${
                      index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-2 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
