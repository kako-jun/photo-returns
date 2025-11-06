import { Table, flexRender } from "@tanstack/react-table";
import { HiOutlineMagnifyingGlass, HiOutlineCog } from "react-icons/hi2";
import type { MediaInfo, ProcessResult } from "../types";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { ScrollToTopButton } from "./ScrollToTopButton";
import { ProcessSummary } from "./ProcessSummary";
import { ProcessingFlow } from "./ProcessingFlow";
import { LightBox } from "./LightBox";
import { DirectorySelection } from "./DirectorySelection";
import { DefaultSettings } from "./DefaultSettings";

interface MainLayoutProps {
  // Dark mode
  isDark: boolean;
  onToggleDarkMode: () => void;

  // Directory selection
  inputDir: string;
  outputDir: string;
  onSelectInputDir: () => void;
  onSelectOutputDir: () => void;

  // Default settings for photos
  defaultPhotoDateSource: "Exif" | "FileName" | "FileCreated" | "FileModified";
  defaultPhotoTimezoneOffset: string;
  defaultPhotoRotationMode: "none" | "exif" | "90" | "180" | "270";
  onPhotoDateSourceChange: (value: "Exif" | "FileName" | "FileCreated" | "FileModified") => void;
  onPhotoTimezoneOffsetChange: (value: string) => void;
  onPhotoRotationModeChange: (value: "none" | "exif" | "90" | "180" | "270") => void;

  // Default settings for videos
  defaultVideoDateSource: "Exif" | "FileName" | "FileCreated" | "FileModified";
  defaultVideoTimezoneOffset: string;
  defaultVideoRotationMode: "none" | "exif" | "90" | "180" | "270";
  onVideoDateSourceChange: (value: "Exif" | "FileName" | "FileCreated" | "FileModified") => void;
  onVideoTimezoneOffsetChange: (value: string) => void;
  onVideoRotationModeChange: (value: "none" | "exif" | "90" | "180" | "270") => void;

  // Actions
  onScanMedia: () => void;
  isScanning: boolean;
  onProcessMedia: () => void;
  onRetryFailed: () => void;
  isProcessing: boolean;

  // Data
  mediaList: MediaInfo[];
  processResult: ProcessResult | null;
  table: Table<MediaInfo>;
  columns: any[];

  // Lightbox
  lightboxIndex: number | null;
  onSetLightboxIndex: (index: number | null) => void;

  // Scroll to top
  showScrollToTop: boolean;
  onScrollToTop: () => void;

  // Mock mode
  isMockMode: boolean;
}

export function MainLayout({
  isDark,
  onToggleDarkMode,
  inputDir,
  outputDir,
  onSelectInputDir,
  onSelectOutputDir,
  defaultPhotoDateSource,
  defaultPhotoTimezoneOffset,
  defaultPhotoRotationMode,
  onPhotoDateSourceChange,
  onPhotoTimezoneOffsetChange,
  onPhotoRotationModeChange,
  defaultVideoDateSource,
  defaultVideoTimezoneOffset,
  defaultVideoRotationMode,
  onVideoDateSourceChange,
  onVideoTimezoneOffsetChange,
  onVideoRotationModeChange,
  onScanMedia,
  isScanning,
  onProcessMedia,
  onRetryFailed,
  isProcessing,
  mediaList,
  processResult,
  table,
  columns,
  lightboxIndex,
  onSetLightboxIndex,
  showScrollToTop,
  onScrollToTop,
  isMockMode,
}: MainLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col p-5 bg-gray-50 dark:bg-gray-900">
      {isMockMode && (
        <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-500 rounded">
          <p className="text-yellow-800 dark:text-yellow-300 font-semibold">
            🎨 モックモード - ブラウザでのUI開発用（Tauri APIは無効）
          </p>
        </div>
      )}
      <Header isDark={isDark} onToggleDarkMode={onToggleDarkMode} />

      <section className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <div className="flex flex-col gap-5">
          <DirectorySelection
            inputDir={inputDir}
            outputDir={outputDir}
            onSelectInputDir={onSelectInputDir}
            onSelectOutputDir={onSelectOutputDir}
          />

          <DefaultSettings
            defaultPhotoDateSource={defaultPhotoDateSource}
            defaultPhotoTimezoneOffset={defaultPhotoTimezoneOffset}
            defaultPhotoRotationMode={defaultPhotoRotationMode}
            onPhotoDateSourceChange={onPhotoDateSourceChange}
            onPhotoTimezoneOffsetChange={onPhotoTimezoneOffsetChange}
            onPhotoRotationModeChange={onPhotoRotationModeChange}
            defaultVideoDateSource={defaultVideoDateSource}
            defaultVideoTimezoneOffset={defaultVideoTimezoneOffset}
            defaultVideoRotationMode={defaultVideoRotationMode}
            onVideoDateSourceChange={onVideoDateSourceChange}
            onVideoTimezoneOffsetChange={onVideoTimezoneOffsetChange}
            onVideoRotationModeChange={onVideoRotationModeChange}
          />

          <div className="flex gap-4 justify-center pt-2">
            <button
              onClick={onScanMedia}
              disabled={!inputDir || isScanning}
              className="px-6 py-3 text-base font-semibold rounded-lg transition-all bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-white shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <HiOutlineMagnifyingGlass className="w-5 h-5" />
              {isScanning ? "Scanning..." : "Scan Media Files"}
            </button>
            <button
              onClick={onProcessMedia}
              disabled={!inputDir || !outputDir || mediaList.length === 0 || isProcessing}
              className="px-6 py-3 text-base font-semibold rounded-lg transition-all bg-green-600 hover:bg-green-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-white shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <HiOutlineCog className={`w-5 h-5 ${isProcessing ? 'animate-spin' : ''}`} />
              {isProcessing ? "Processing..." : "Process & Rename"}
            </button>
          </div>
        </div>
      </section>

      {processResult && <ProcessSummary processResult={processResult} mediaList={mediaList} onRetryFailed={onRetryFailed} />}

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
          onClose={() => onSetLightboxIndex(null)}
          onPrevious={() => onSetLightboxIndex(lightboxIndex - 1)}
          onNext={() => onSetLightboxIndex(lightboxIndex + 1)}
          isMockMode={isMockMode}
        />
      )}

      <ScrollToTopButton show={showScrollToTop} onClick={onScrollToTop} />
    </div>
  );
}
