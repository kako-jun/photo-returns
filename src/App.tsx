import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { HiOutlineFolderOpen, HiOutlineMagnifyingGlass, HiOutlineCog, HiOutlineMoon, HiOutlineSun, HiOutlineRectangleStack, HiOutlineBars3, HiOutlineSquare3Stack3D, HiOutlineCamera, HiPhoto, HiFilm, HiXMark, HiChevronLeft, HiChevronRight } from "react-icons/hi2";
import "./App.css";
import { MOCK_ENABLED, mockMediaList, mockProcessResult } from "./mock-data";

// Rust側のMediaInfo型に対応
export interface MediaInfo {
  original_path: string;
  file_name: string;
  media_type: "Photo" | "Video";
  date_taken: string | null;
  subsec_time: number | null; // ミリ秒（0-999）
  timezone: string | null; // タイムゾーンオフセット（例："+09:00", null=TZ情報なし）
  new_name: string;
  new_path: string;
  file_size: number;
  burst_group_id: number | null;
  burst_index: number | null;
  date_source: "Exif" | "FileName" | "FileCreated" | "FileModified" | "None";
  exif_orientation: number | null;
  rotation_applied: boolean;
  width: number | null;
  height: number | null;
  progress?: number; // 進捗（0-100）
  status?: "pending" | "processing" | "completed" | "error" | "no_change";
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  // LightBox キーボードナビゲーション
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxIndex(null);
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) => {
          if (prev === null || prev === 0) return prev;
          return prev - 1;
        });
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((prev) => {
          if (prev === null || prev === mediaList.length - 1) return prev;
          return prev + 1;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, mediaList.length]);

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
    columnHelper.display({
      id: "index",
      header: "#",
      cell: (info) => (
        <span className="text-gray-600 dark:text-gray-400 font-semibold">
          {info.row.index + 1}
        </span>
      ),
      size: 50,
    }),
    columnHelper.display({
      id: "preview",
      header: "Preview",
      cell: (info) => {
        const mediaType = info.row.original.media_type;
        const originalPath = info.row.original.original_path;
        const rowIndex = info.row.index;

        if (MOCK_ENABLED) {
          // モックモードでは画像を表示しない
          return (
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
              {mediaType === "Photo" ? (
                <HiPhoto className="w-8 h-8 text-gray-400" />
              ) : (
                <HiFilm className="w-8 h-8 text-gray-400" />
              )}
            </div>
          );
        }

        if (mediaType === "Photo") {
          const assetUrl = convertFileSrc(originalPath);
          return (
            <button
              onClick={() => setLightboxIndex(rowIndex)}
              className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              title="Click to view full size"
            >
              <img
                src={assetUrl}
                alt="thumbnail"
                className="w-16 h-16 object-cover rounded border border-gray-300 dark:border-gray-600 hover:opacity-80 transition-opacity cursor-pointer"
                loading="lazy"
              />
            </button>
          );
        } else {
          // 動画の場合はアイコン表示（クリック不可）
          return (
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center border border-gray-300 dark:border-gray-600">
              <HiFilm className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
          );
        }
      },
      size: 80,
    }),
    columnHelper.accessor("media_type", {
      header: "Type",
      cell: (info) => {
        const hasExif = info.row.original.date_source === "Exif";
        return (
          <div className="flex items-center gap-1">
            <span
              className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                info.getValue() === "Photo"
                  ? "bg-blue-500 text-white"
                  : "bg-purple-600 text-white"
              }`}
            >
              {info.getValue()}
            </span>
            {info.getValue() === "Photo" && hasExif && (
              <HiOutlineCamera className="w-4 h-4 text-green-600 dark:text-green-400" title="EXIF data available" />
            )}
          </div>
        );
      },
      size: 110,
    }),
    columnHelper.accessor("file_name", {
      header: "Original Name",
      cell: (info) => (
        <button
          onClick={async () => {
            if (MOCK_ENABLED) {
              alert("Mock mode: Cannot open file manager");
              return;
            }
            try {
              await invoke("reveal_in_filemanager", { path: info.row.original.original_path });
            } catch (err) {
              console.error("Failed to reveal file:", err);
              alert(`Failed to open file manager: ${err}`);
            }
          }}
          className="text-left text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          title={`Click to reveal: ${info.row.original.original_path}`}
        >
          {info.getValue()}
        </button>
      ),
      size: 250,
    }),
    columnHelper.accessor("date_source", {
      header: "Date Source",
      cell: (info) => {
        const source = info.getValue();
        const sourceColors = {
          Exif: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300",
          FileName: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300",
          FileCreated: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300",
          FileModified: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300",
          None: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300",
        };
        const displayText = {
          Exif: "EXIF",
          FileName: "FileName",
          FileCreated: "Created",
          FileModified: "Modified",
          None: "None",
        };
        return (
          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${sourceColors[source]}`}>
            {displayText[source]}
          </span>
        );
      },
      size: 110,
    }),
    columnHelper.accessor("date_taken", {
      header: "Date Taken",
      cell: (info) => {
        const date = info.getValue();
        if (!date) return <span className="text-gray-900 dark:text-gray-100">N/A</span>;

        const d = new Date(date);
        const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const timezone = info.row.original.timezone;
        const tzDisplay = timezone ? (
          <span className="text-xs text-blue-600 dark:text-blue-400 ml-1" title="Timezone from EXIF">
            {timezone}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1" title="No timezone information">
            (no TZ)
          </span>
        );
        return (
          <div className="flex items-center">
            <span className="text-gray-900 dark:text-gray-100 font-mono">{formatted}</span>
            {tzDisplay}
          </div>
        );
      },
      size: 230,
    }),
    columnHelper.display({
      id: "resolution",
      header: "Resolution",
      cell: (info) => {
        const { width, height } = info.row.original;
        if (!width || !height) return <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>;

        // アスペクト比を判定
        const isPortrait = height > width;
        const isSquare = height === width;
        const isLandscape = width > height;

        return (
          <div className="flex items-center gap-1">
            {isPortrait && <HiOutlineBars3 className="w-4 h-4 text-blue-600 dark:text-blue-400 rotate-90" title="Portrait" />}
            {isLandscape && <HiOutlineBars3 className="w-4 h-4 text-purple-600 dark:text-purple-400" title="Landscape" />}
            {isSquare && <HiOutlineSquare3Stack3D className="w-4 h-4 text-green-600 dark:text-green-400" title="Square" />}
            <span className="text-gray-900 dark:text-gray-100 text-xs font-mono">{width}×{height}</span>
          </div>
        );
      },
      size: 130,
    }),
    columnHelper.display({
      id: "rotation",
      header: "Rotated",
      cell: (info) => {
        const { rotation_applied, exif_orientation } = info.row.original;
        if (!exif_orientation || exif_orientation === 1) {
          return <span className="text-gray-400 dark:text-gray-500">-</span>;
        }
        return (
          <span className={`text-xs ${rotation_applied ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
            {rotation_applied ? '✓' : `Orient ${exif_orientation}`}
          </span>
        );
      },
      size: 80,
    }),
    columnHelper.accessor("file_size", {
      header: "Size",
      cell: (info) => {
        const size = info.getValue();
        const formatted = size > 1024 * 1024
          ? `${(size / (1024 * 1024)).toFixed(1)} MB`
          : `${(size / 1024).toFixed(1)} KB`;
        return <span className="text-gray-900 dark:text-gray-100 text-xs">{formatted}</span>;
      },
      size: 90,
    }),
    columnHelper.accessor("new_name", {
      header: "New Name",
      cell: (info) => {
        const newPath = info.row.original.new_path;
        const hasNewPath = newPath && newPath !== "";

        return (
          <button
            onClick={async () => {
              if (MOCK_ENABLED) {
                alert("Mock mode: Cannot open file manager");
                return;
              }
              if (!hasNewPath) {
                alert("File has not been processed yet");
                return;
              }
              try {
                await invoke("reveal_in_filemanager", { path: newPath });
              } catch (err) {
                console.error("Failed to reveal file:", err);
                alert(`Failed to open file manager: ${err}`);
              }
            }}
            className={`font-mono text-xs font-semibold text-left ${
              hasNewPath
                ? "text-green-600 dark:text-green-400 hover:underline cursor-pointer"
                : "text-gray-400 dark:text-gray-500 cursor-not-allowed"
            }`}
            title={hasNewPath ? `Click to reveal: ${newPath}` : "Not processed yet"}
            disabled={!hasNewPath}
          >
            {info.getValue()}
          </button>
        );
      },
      size: 200,
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
          no_change: "bg-gray-500 text-white",
        };
        const displayText = {
          pending: "PENDING",
          processing: "PROCESSING",
          completed: "COMPLETED",
          error: "ERROR",
          no_change: "NO CHANGE",
        };
        return (
          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold uppercase ${statusColors[status]}`}>
            {displayText[status]}
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
          no_change: "bg-gray-500",
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
    <div className="min-h-screen flex flex-col p-5 bg-gray-50 dark:bg-gray-900">
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

      {/* LightBox Modal */}
      {lightboxIndex !== null && mediaList[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-70 transition-all"
            title="Close (ESC)"
          >
            <HiXMark className="w-8 h-8" />
          </button>

          {lightboxIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex - 1);
              }}
              className="absolute left-4 text-white hover:text-gray-300 p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-70 transition-all"
              title="Previous (←)"
            >
              <HiChevronLeft className="w-8 h-8" />
            </button>
          )}

          {lightboxIndex < mediaList.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex + 1);
              }}
              className="absolute right-4 text-white hover:text-gray-300 p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-70 transition-all"
              title="Next (→)"
            >
              <HiChevronRight className="w-8 h-8" />
            </button>
          )}

          <div
            className="max-w-[90vw] max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={convertFileSrc(mediaList[lightboxIndex].original_path)}
              alt={mediaList[lightboxIndex].file_name}
              className="max-w-full max-h-[80vh] object-contain rounded shadow-2xl"
            />
            <div className="mt-4 text-center text-white bg-black bg-opacity-70 px-4 py-2 rounded">
              <p className="font-semibold">{mediaList[lightboxIndex].file_name}</p>
              <p className="text-sm text-gray-300">
                {lightboxIndex + 1} / {mediaList.length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
