import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper,
  ExpandedState,
} from "@tanstack/react-table";
import { HiOutlineFolderOpen, HiOutlineMagnifyingGlass, HiOutlineCog, HiOutlineRectangleStack, HiOutlineBars3, HiOutlineSquare3Stack3D, HiOutlineCamera, HiPhoto, HiFilm, HiChevronDown, HiChevronRight as HiChevronRightCollapsed } from "react-icons/hi2";
import "./App.css";
import { MOCK_ENABLED, mockMediaList, mockProcessResult } from "./mock-data";
import type { MediaInfo, ProcessResult } from "./types";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ScrollToTopButton } from "./components/ScrollToTopButton";
import { ProcessSummary } from "./components/ProcessSummary";
import { ProcessingFlow } from "./components/ProcessingFlow";
import { LightBox } from "./components/LightBox";

const columnHelper = createColumnHelper<MediaInfo>();

// EXIF orientationを角度に変換
function getOrientationDegrees(orientation: number | null): string | null {
  if (!orientation) return null;
  switch (orientation) {
    case 1: return "0°";
    case 3: return "180°";
    case 6: return "90°";
    case 8: return "270°";
    default: return null;
  }
}

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
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // 全体のデフォルト設定（静止画と動画で別）
  const [defaultPhotoDateSource, setDefaultPhotoDateSource] = useState<"Exif" | "FileName" | "FileCreated" | "FileModified">("Exif");
  const [defaultPhotoTimezoneOffset, setDefaultPhotoTimezoneOffset] = useState<string>("exif");
  const [defaultPhotoRotationMode, setDefaultPhotoRotationMode] = useState<"none" | "exif" | "90" | "180" | "270">("exif");
  const [defaultVideoDateSource, setDefaultVideoDateSource] = useState<"Exif" | "FileName" | "FileCreated" | "FileModified">("FileModified");
  const [defaultVideoTimezoneOffset, setDefaultVideoTimezoneOffset] = useState<string>("none");
  const [defaultVideoRotationMode, setDefaultVideoRotationMode] = useState<"none" | "exif" | "90" | "180" | "270">("none");

  // ユーザーの確認が必要な行（error、pending）を自動展開
  useEffect(() => {
    const newExpanded: ExpandedState = {};
    mediaList.forEach((item, index) => {
      // error: 処理失敗、pending: 処理待ち → 確認が必要
      // processing: 処理中、completed: 完了、no_change: 変更なし → 展開不要
      if (item.status === "error" || item.status === "pending") {
        newExpanded[index] = true;
      }
    });
    setExpanded(newExpanded);
  }, [mediaList]);

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

  // スクロール位置の監視（トップに戻るボタン表示制御）
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 300);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleDarkMode = () => {
    setIsDark(!isDark);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
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

      // 初期ステータスとデフォルト設定を適用（静止画と動画で分ける）
      const mediaWithStatus = result.map((item) => {
        const isPhoto = item.media_type === "Photo";
        const preferredDateSource = isPhoto ? defaultPhotoDateSource : defaultVideoDateSource;

        // デフォルトのDate Sourceが利用可能かチェック
        let finalDateSource = item.date_source;
        let finalDateTaken = item.date_taken;

        const getDateForSource = (source: string) => {
          switch (source) {
            case "Exif": return item.exif_date;
            case "FileName": return item.filename_date;
            case "FileCreated": return item.file_created_date;
            case "FileModified": return item.file_modified_date;
            default: return null;
          }
        };

        const preferredDate = getDateForSource(preferredDateSource);
        if (preferredDate) {
          finalDateSource = preferredDateSource as any;
          finalDateTaken = preferredDate;
        }

        return {
          ...item,
          date_source: finalDateSource,
          date_taken: finalDateTaken,
          progress: 0,
          status: "pending" as const,
          timezone_offset: isPhoto ? defaultPhotoTimezoneOffset : defaultVideoTimezoneOffset,
          rotation_mode: isPhoto ? defaultPhotoRotationMode : defaultVideoRotationMode,
        };
      });

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
      id: "expander",
      header: "",
      cell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            row.toggleExpanded();
          }}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          {row.getIsExpanded() ? (
            <HiChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          ) : (
            <HiChevronRightCollapsed className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          )}
        </button>
      ),
      size: 40,
    }),
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
          // モックモードでもクリック可能に
          if (mediaType === "Photo") {
            return (
              <button
                onClick={() => setLightboxIndex(rowIndex)}
                className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Click to view details (mock mode)"
              >
                <HiPhoto className="w-8 h-8 text-gray-400" />
              </button>
            );
          } else {
            return (
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                <HiFilm className="w-8 h-8 text-gray-400" />
              </div>
            );
          }
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
        const media = info.row.original;
        const currentSource = info.getValue();

        // 利用可能な候補を構築
        const availableSources: Array<{ value: string; label: string; date: string | null }> = [];
        if (media.exif_date) availableSources.push({ value: "Exif", label: "EXIF", date: media.exif_date });
        if (media.filename_date) availableSources.push({ value: "FileName", label: "FileName", date: media.filename_date });
        if (media.file_created_date) availableSources.push({ value: "FileCreated", label: "Created", date: media.file_created_date });
        if (media.file_modified_date) availableSources.push({ value: "FileModified", label: "Modified", date: media.file_modified_date });

        const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
          const newSource = e.target.value;
          const selectedOption = availableSources.find(s => s.value === newSource);

          if (selectedOption && selectedOption.date) {
            // mediaListを更新
            setMediaList(prevList =>
              prevList.map((item, idx) =>
                idx === info.row.index
                  ? { ...item, date_source: newSource as any, date_taken: selectedOption.date }
                  : item
              )
            );
          }
        };

        const sourceColors = {
          Exif: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300",
          FileName: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300",
          FileCreated: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300",
          FileModified: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300",
          None: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300",
        };

        return (
          <select
            value={currentSource}
            onChange={handleSourceChange}
            className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer border border-gray-300 dark:border-gray-600 ${sourceColors[currentSource]}`}
          >
            {availableSources.map(option => (
              <option
                key={option.value}
                value={option.value}
                className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {option.label}
              </option>
            ))}
            {availableSources.length === 0 && (
              <option
                value="None"
                className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                None
              </option>
            )}
          </select>
        );
      },
      size: 120,
    }),
    columnHelper.accessor("date_taken", {
      header: "Date Taken",
      cell: (info) => {
        const date = info.getValue();
        const media = info.row.original;
        const exifTimezone = media.timezone; // EXIF由来のTZ（参考表示用）
        const selectedOffset = media.timezone_offset ?? "none"; // ユーザー選択のオフセット

        if (!date) return <span className="text-gray-900 dark:text-gray-100">N/A</span>;

        let d = new Date(date);

        // ユーザーが選択したTZオフセットを適用
        let offsetToUse = selectedOffset;
        if (selectedOffset === "exif" && exifTimezone) {
          // EXIFが選ばれていて、EXIF TZ情報がある場合はそれを使う
          offsetToUse = exifTimezone;
        }

        if (offsetToUse !== "none" && offsetToUse !== "exif") {
          const match = offsetToUse.match(/([+-])(\d{2}):(\d{2})/);
          if (match) {
            const sign = match[1] === '+' ? 1 : -1;
            const hours = parseInt(match[2], 10);
            const minutes = parseInt(match[3], 10);
            const offsetMinutes = sign * (hours * 60 + minutes);

            // 日本時間は UTC+9 = +540分
            const japanOffsetMinutes = 540;
            const diffMinutes = japanOffsetMinutes - offsetMinutes;

            // 差分を適用
            d = new Date(d.getTime() + diffMinutes * 60 * 1000);
          }
        }

        const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

        const handleOffsetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
          setMediaList(prevList =>
            prevList.map((item, idx) =>
              idx === info.row.index
                ? { ...item, timezone_offset: e.target.value }
                : item
            )
          );
        };

        return (
          <div className="flex flex-col gap-1">
            <span className="text-gray-900 dark:text-gray-100 font-mono text-xs">{formatted}</span>
            {exifTimezone && (
              <span className="text-xs text-gray-400 dark:text-gray-500" title="EXIF Timezone (reference only)">
                EXIF: {exifTimezone}
              </span>
            )}
            <div className="flex items-center gap-1">
              <select
                value={selectedOffset}
                onChange={handleOffsetChange}
                className="w-28 px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                <option value="none">None</option>
                <option value="exif">
                  EXIF{exifTimezone ? ` (${exifTimezone})` : ""}
                </option>
                <option value="-12:00">-12:00</option>
                <option value="-11:00">-11:00</option>
                <option value="-10:00">-10:00</option>
                <option value="-09:00">-09:00</option>
                <option value="-08:00">-08:00</option>
                <option value="-07:00">-07:00</option>
                <option value="-06:00">-06:00</option>
                <option value="-05:00">-05:00</option>
                <option value="-04:00">-04:00</option>
                <option value="-03:00">-03:00</option>
                <option value="-02:00">-02:00</option>
                <option value="-01:00">-01:00</option>
                <option value="+00:00">+00:00</option>
                <option value="+01:00">+01:00</option>
                <option value="+02:00">+02:00</option>
                <option value="+03:00">+03:00</option>
                <option value="+04:00">+04:00</option>
                <option value="+05:00">+05:00</option>
                <option value="+06:00">+06:00</option>
                <option value="+07:00">+07:00</option>
                <option value="+08:00">+08:00</option>
                <option value="+09:00">+09:00</option>
                <option value="+10:00">+10:00</option>
                <option value="+11:00">+11:00</option>
                <option value="+12:00">+12:00</option>
                <option value="+13:00">+13:00</option>
                <option value="+14:00">+14:00</option>
              </select>
            </div>
          </div>
        );
      },
      size: 200,
    }),
    columnHelper.display({
      id: "burst",
      header: "Burst",
      cell: (info) => {
        const { burst_group_id, burst_index } = info.row.original;

        if (burst_group_id === null || burst_index === null) {
          return <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>;
        }

        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <HiOutlineRectangleStack className="w-3 h-3 text-orange-600 dark:text-orange-400" title="Burst group" />
              <span className="text-xs text-gray-900 dark:text-gray-100 font-mono">
                G{burst_group_id}
              </span>
            </div>
            <span className="text-xs text-orange-600 dark:text-orange-400 font-semibold">
              #{burst_index}
            </span>
          </div>
        );
      },
      size: 70,
    }),
    columnHelper.display({
      id: "resolution",
      header: "Resolution",
      cell: (info) => {
        const { width, height, file_size } = info.row.original;

        // ファイルサイズのフォーマット
        const formattedSize = file_size > 1024 * 1024
          ? `${(file_size / (1024 * 1024)).toFixed(1)} MB`
          : `${(file_size / 1024).toFixed(1)} KB`;

        if (!width || !height) {
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>
              <span className="text-gray-600 dark:text-gray-400 text-xs">{formattedSize}</span>
            </div>
          );
        }

        // アスペクト比を判定
        const isPortrait = height > width;
        const isSquare = height === width;
        const isLandscape = width > height;

        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              {isPortrait && <HiOutlineBars3 className="w-4 h-4 text-blue-600 dark:text-blue-400 rotate-90" title="Portrait" />}
              {isLandscape && <HiOutlineBars3 className="w-4 h-4 text-purple-600 dark:text-purple-400" title="Landscape" />}
              {isSquare && <HiOutlineSquare3Stack3D className="w-4 h-4 text-green-600 dark:text-green-400" title="Square" />}
              <span className="text-gray-900 dark:text-gray-100 text-xs font-mono">{width}×{height}</span>
            </div>
            <span className="text-gray-600 dark:text-gray-400 text-xs">{formattedSize}</span>
          </div>
        );
      },
      size: 130,
    }),
    columnHelper.display({
      id: "rotation",
      header: "Rotate",
      cell: (info) => {
        const media = info.row.original;
        const { exif_orientation } = media;
        const rotationMode = media.rotation_mode ?? (exif_orientation && exif_orientation !== 1 ? "exif" : "none");
        const exifDegrees = getOrientationDegrees(exif_orientation);

        const handleRotationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
          setMediaList(prevList =>
            prevList.map((item, idx) =>
              idx === info.row.index
                ? { ...item, rotation_mode: e.target.value as any }
                : item
            )
          );
        };

        return (
          <select
            value={rotationMode}
            onChange={handleRotationChange}
            className="w-24 px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
          >
            <option value="none">なし</option>
            <option value="exif">
              EXIF{exifDegrees ? ` (${exifDegrees})` : ""}
            </option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </select>
        );
      },
      size: 100,
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
              className={`h-full rounded-l-full transition-all duration-300 ${progressColors[status]}`}
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
    state: {
      expanded,
    },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
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
      <Header isDark={isDark} onToggleDarkMode={toggleDarkMode} />

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

          {/* 全体のデフォルト設定 */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Default Settings</h3>
            <div className="grid grid-cols-2 gap-6">
              {/* 静止画の設定 */}
              <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/10">
                <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-1">
                  <HiPhoto className="w-4 h-4" />
                  Photo
                </h4>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">Date Source:</label>
                    <select
                      value={defaultPhotoDateSource}
                      onChange={(e) => setDefaultPhotoDateSource(e.target.value as any)}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                    >
                      <option value="Exif" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">EXIF</option>
                      <option value="FileName" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">FileName</option>
                      <option value="FileCreated" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Created</option>
                      <option value="FileModified" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Modified</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">TZ Correction:</label>
                    <select
                      value={defaultPhotoTimezoneOffset}
                      onChange={(e) => setDefaultPhotoTimezoneOffset(e.target.value)}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                    >
                      <option value="none">None</option>
                      <option value="exif">EXIF</option>
                      <option value="-12:00">-12:00</option>
                      <option value="-11:00">-11:00</option>
                      <option value="-10:00">-10:00</option>
                      <option value="-09:00">-09:00</option>
                      <option value="-08:00">-08:00</option>
                      <option value="-07:00">-07:00</option>
                      <option value="-06:00">-06:00</option>
                      <option value="-05:00">-05:00</option>
                      <option value="-04:00">-04:00</option>
                      <option value="-03:00">-03:00</option>
                      <option value="-02:00">-02:00</option>
                      <option value="-01:00">-01:00</option>
                      <option value="+00:00">+00:00</option>
                      <option value="+01:00">+01:00</option>
                      <option value="+02:00">+02:00</option>
                      <option value="+03:00">+03:00</option>
                      <option value="+04:00">+04:00</option>
                      <option value="+05:00">+05:00</option>
                      <option value="+06:00">+06:00</option>
                      <option value="+07:00">+07:00</option>
                      <option value="+08:00">+08:00</option>
                      <option value="+09:00">+09:00</option>
                      <option value="+10:00">+10:00</option>
                      <option value="+11:00">+11:00</option>
                      <option value="+12:00">+12:00</option>
                      <option value="+13:00">+13:00</option>
                      <option value="+14:00">+14:00</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">Rotation:</label>
                    <select
                      value={defaultPhotoRotationMode}
                      onChange={(e) => setDefaultPhotoRotationMode(e.target.value as any)}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                    >
                      <option value="none">None</option>
                      <option value="exif">EXIF</option>
                      <option value="90">90°</option>
                      <option value="180">180°</option>
                      <option value="270">270°</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 動画の設定 */}
              <div className="border border-purple-200 dark:border-purple-800 rounded-lg p-3 bg-purple-50 dark:bg-purple-900/10">
                <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1">
                  <HiFilm className="w-4 h-4" />
                  Video
                </h4>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">Date Source:</label>
                    <select
                      value={defaultVideoDateSource}
                      onChange={(e) => setDefaultVideoDateSource(e.target.value as any)}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                    >
                      <option value="FileName" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">FileName</option>
                      <option value="FileCreated" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Created</option>
                      <option value="FileModified" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Modified</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">TZ Correction:</label>
                    <select
                      value={defaultVideoTimezoneOffset}
                      onChange={(e) => setDefaultVideoTimezoneOffset(e.target.value)}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                    >
                      <option value="none">None</option>
                      <option value="-12:00">-12:00</option>
                      <option value="-11:00">-11:00</option>
                      <option value="-10:00">-10:00</option>
                      <option value="-09:00">-09:00</option>
                      <option value="-08:00">-08:00</option>
                      <option value="-07:00">-07:00</option>
                      <option value="-06:00">-06:00</option>
                      <option value="-05:00">-05:00</option>
                      <option value="-04:00">-04:00</option>
                      <option value="-03:00">-03:00</option>
                      <option value="-02:00">-02:00</option>
                      <option value="-01:00">-01:00</option>
                      <option value="+00:00">+00:00</option>
                      <option value="+01:00">+01:00</option>
                      <option value="+02:00">+02:00</option>
                      <option value="+03:00">+03:00</option>
                      <option value="+04:00">+04:00</option>
                      <option value="+05:00">+05:00</option>
                      <option value="+06:00">+06:00</option>
                      <option value="+07:00">+07:00</option>
                      <option value="+08:00">+08:00</option>
                      <option value="+09:00">+09:00</option>
                      <option value="+10:00">+10:00</option>
                      <option value="+11:00">+11:00</option>
                      <option value="+12:00">+12:00</option>
                      <option value="+13:00">+13:00</option>
                      <option value="+14:00">+14:00</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">Rotation:</label>
                    <select
                      value={defaultVideoRotationMode}
                      onChange={(e) => setDefaultVideoRotationMode(e.target.value as any)}
                      className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                    >
                      <option value="none">None</option>
                      <option value="90">90°</option>
                      <option value="180">180°</option>
                      <option value="270">270°</option>
                    </select>
                  </div>
                </div>
              </div>
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

      {processResult && <ProcessSummary processResult={processResult} mediaList={mediaList} />}

      <section className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <h3 className="text-gray-800 dark:text-gray-100 font-semibold mb-4">Media Files ({mediaList.length})</h3>
        {mediaList.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-gray-500 py-10 text-lg">
            No media files scanned yet. Select a folder and click "Scan Media Files".
          </p>
        ) : (
          <div className="relative -mx-6">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          style={{ width: header.getSize() }}
                          className="px-2 py-3 text-left font-semibold bg-gray-700 dark:bg-gray-900 text-white sticky top-0 z-20"
                        >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row, index) => (
                  <>
                    <tr
                      key={row.id}
                      id={`media-row-${index}`}
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
                    {row.getIsExpanded() && (
                      <tr key={`${row.id}-expanded`}>
                        <td colSpan={columns.length} className="px-0 py-0 bg-gray-100 dark:bg-gray-900">
                          {/* 処理フロー表示エリア */}
                          <ProcessingFlow media={row.original} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <Footer />

      {lightboxIndex !== null && mediaList[lightboxIndex] && (
        <LightBox
          mediaList={mediaList}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrevious={() => setLightboxIndex(lightboxIndex - 1)}
          onNext={() => setLightboxIndex(lightboxIndex + 1)}
          isMockMode={MOCK_ENABLED}
        />
      )}

      <ScrollToTopButton show={showScrollToTop} onClick={scrollToTop} />
    </div>
  );
}

export default App;
