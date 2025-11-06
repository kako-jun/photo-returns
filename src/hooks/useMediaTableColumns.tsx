import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  HiOutlineCamera,
  HiPhoto,
  HiFilm,
  HiChevronDown,
  HiChevronRight as HiChevronRightCollapsed,
  HiOutlineRectangleStack,
  HiOutlineBars3,
  HiOutlineSquare3Stack3D,
} from "react-icons/hi2";
import type { MediaInfo } from "../types";

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

interface UseMediaTableColumnsProps {
  setLightboxIndex: (index: number | null) => void;
  setMediaList: React.Dispatch<React.SetStateAction<MediaInfo[]>>;
  isMockMode: boolean;
}

export function useMediaTableColumns({
  setLightboxIndex,
  setMediaList,
  isMockMode,
}: UseMediaTableColumnsProps) {
  return useMemo(
    () => [
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
        id: "before",
        header: "Before",
        cell: (info) => {
          const mediaType = info.row.original.media_type;
          const originalPath = info.row.original.original_path;
          const rowIndex = info.row.index;

          if (isMockMode) {
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
          const hasExif = !!info.row.original.exif_date;
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
              if (isMockMode) {
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
            <div className="relative inline-block">
              <select
                value={currentSource}
                onChange={handleSourceChange}
                className={`appearance-none px-2 py-1 pr-6 rounded text-xs font-semibold cursor-pointer border border-gray-300 dark:border-gray-600 ${sourceColors[currentSource]}`}
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
            <HiChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-600 dark:text-gray-400" />
          </div>
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

          // 元の時刻をそのまま表示（TZ補正は適用しない）
          const d = new Date(date);
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
                <div className="relative">
                  <select
                    value={selectedOffset}
                    onChange={handleOffsetChange}
                    className="appearance-none w-28 px-1 py-0.5 pr-5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
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
                  <HiChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-gray-600 dark:text-gray-400" />
                </div>
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
            <div className="flex flex-col gap-1">
              {exifDegrees && (
                <span className="text-xs text-gray-400 dark:text-gray-500" title="EXIF Orientation (reference only)">
                  EXIF: {exifDegrees}
                </span>
              )}
              <div className="relative w-32">
                <select
                  value={rotationMode}
                  onChange={handleRotationChange}
                  className="appearance-none w-full px-2 py-0.5 pr-6 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                >
                  <option value="none">None</option>
                  <option value="exif">
                    EXIF{exifDegrees ? ` (${exifDegrees})` : ""}
                  </option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
                <HiChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          );
        },
        size: 100,
      }),
      columnHelper.display({
        id: "after",
        header: "After",
        cell: (info) => {
          const media = info.row.original;
          const mediaType = media.media_type;
          const originalPath = media.original_path;
          const { exif_orientation } = media;
          const rotationMode = media.rotation_mode ?? (exif_orientation && exif_orientation !== 1 ? "exif" : "none");

          // 回転角度を計算
          const getRotationDegrees = (): number => {
            if (rotationMode === "none") return 0;
            if (rotationMode === "exif" && exif_orientation) {
              switch (exif_orientation) {
                case 1: return 0;
                case 3: return 180;
                case 6: return 90;
                case 8: return 270;
                default: return 0;
              }
            }
            if (rotationMode === "90") return 90;
            if (rotationMode === "180") return 180;
            if (rotationMode === "270") return 270;
            return 0;
          };

          const degrees = getRotationDegrees();

          // 回転がない場合は「-」を表示
          if (degrees === 0) {
            return (
              <div className="w-16 h-16 flex items-center justify-center text-gray-400 dark:text-gray-500">
                <span className="text-xs">-</span>
              </div>
            );
          }

          if (isMockMode) {
            // モックモードではアイコンを回転表示
            if (mediaType === "Photo") {
              return (
                <div
                  className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center"
                  style={{ transform: `rotate(${degrees}deg)` }}
                >
                  <HiPhoto className="w-8 h-8 text-gray-400" />
                </div>
              );
            } else {
              return (
                <div
                  className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center"
                  style={{ transform: `rotate(${degrees}deg)` }}
                >
                  <HiFilm className="w-8 h-8 text-gray-400" />
                </div>
              );
            }
          }

          if (mediaType === "Photo") {
            const assetUrl = convertFileSrc(originalPath);
            return (
              <div className="w-16 h-16 flex items-center justify-center">
                <img
                  src={assetUrl}
                  alt="rotated preview"
                  className="object-cover rounded border border-gray-300 dark:border-gray-600"
                  style={{
                    transform: `rotate(${degrees}deg)`,
                    width: '64px',
                    height: '64px',
                  }}
                  loading="lazy"
                />
              </div>
            );
          } else {
            // 動画の場合はアイコンを回転表示
            return (
              <div
                className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center border border-gray-300 dark:border-gray-600"
                style={{ transform: `rotate(${degrees}deg)` }}
              >
                <HiFilm className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
            );
          }
        },
        size: 80,
      }),
      columnHelper.accessor("new_name", {
        header: "New Name",
        cell: (info) => {
          const media = info.row.original;
          const newPath = media.new_path;
          const hasNewPath = newPath && newPath !== "";

          // TZ補正を適用してファイル名を動的に生成
          const calculateNewName = (): string => {
            const dateTaken = media.date_taken;
            if (!dateTaken) return "unknown_date";

            let d = new Date(dateTaken);
            const selectedOffset = media.timezone_offset ?? "none";
            const exifTimezone = media.timezone;

            // TZ補正を適用
            let offsetToUse = selectedOffset;
            if (selectedOffset === "exif" && exifTimezone) {
              offsetToUse = exifTimezone;
            }

            if (offsetToUse !== "none" && offsetToUse !== "exif") {
              const match = offsetToUse.match(/([+-])(\d{2}):(\d{2})/);
              if (match) {
                const sign = match[1] === '+' ? 1 : -1;
                const hours = parseInt(match[2], 10);
                const minutes = parseInt(match[3], 10);
                const offsetMinutes = sign * (hours * 60 + minutes);
                d = new Date(d.getTime() + offsetMinutes * 60 * 1000);
              }
            }

            // ファイル名を生成
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hour = String(d.getHours()).padStart(2, '0');
            const minute = String(d.getMinutes()).padStart(2, '0');
            const second = String(d.getSeconds()).padStart(2, '0');

            // 拡張子を取得
            const extension = media.file_name.split('.').pop() || 'jpg';

            // ミリ秒があれば追加
            if (media.subsec_time !== null && media.subsec_time !== undefined) {
              const ms = String(media.subsec_time).padStart(3, '0');
              return `${year}-${month}-${day}_${hour}-${minute}-${second}-${ms}.${extension}`;
            } else {
              return `${year}-${month}-${day}_${hour}-${minute}-${second}.${extension}`;
            }
          };

          const newName = calculateNewName();
          const hasNewName = newName && newName !== "unknown_date";

          return (
            <button
              onClick={async () => {
                if (isMockMode) {
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
                hasNewName
                  ? "text-green-600 dark:text-green-400" + (hasNewPath ? " hover:underline cursor-pointer" : " cursor-default")
                  : "text-gray-400 dark:text-gray-500 cursor-not-allowed"
              }`}
              title={hasNewPath ? `Click to reveal: ${newPath}` : (hasNewName ? "Preview name (not processed yet)" : "Not processed yet")}
            >
              {newName}
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
    ],
    [setLightboxIndex, setMediaList, isMockMode]
  );
}
