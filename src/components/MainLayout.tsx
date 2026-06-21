import { Table, flexRender, type ColumnDef } from '@tanstack/react-table';
import { HiOutlineMagnifyingGlass, HiOutlineCog } from 'react-icons/hi2';
import type { MediaInfo, ProcessResult } from '../types';
import { Header } from './Header';
import { Footer } from './Footer';
import { ScrollToTopButton } from './ScrollToTopButton';
import { ProcessSummary } from './ProcessSummary';
import { ProcessingFlow } from './ProcessingFlow';
import { LightBox } from './LightBox';
import { DirectorySelection } from './DirectorySelection';
import { DefaultSettings } from './DefaultSettings';
import { progressPercent } from '../lib/processResults';

interface MainLayoutProps {
  isDark: boolean;
  onToggleDarkMode: () => void;
  inputDir: string;
  outputDir: string;
  onSelectInputDir: () => void;
  onSelectOutputDir: () => void;
  defaultPhotoDateSource: 'Exif' | 'FileName' | 'FileCreated' | 'FileModified';
  defaultPhotoTimezoneOffset: string;
  defaultPhotoRotationMode: 'none' | 'exif' | '90' | '180' | '270';
  onPhotoDateSourceChange: (value: 'Exif' | 'FileName' | 'FileCreated' | 'FileModified') => void;
  onPhotoTimezoneOffsetChange: (value: string) => void;
  onPhotoRotationModeChange: (value: 'none' | 'exif' | '90' | '180' | '270') => void;
  defaultVideoDateSource: 'Exif' | 'FileName' | 'FileCreated' | 'FileModified';
  defaultVideoTimezoneOffset: string;
  defaultVideoRotationMode: 'none' | 'exif' | '90' | '180' | '270';
  onVideoDateSourceChange: (value: 'Exif' | 'FileName' | 'FileCreated' | 'FileModified') => void;
  onVideoTimezoneOffsetChange: (value: string) => void;
  onVideoRotationModeChange: (value: 'none' | 'exif' | '90' | '180' | '270') => void;
  onScanMedia: () => void;
  isScanning: boolean;
  onProcessMedia: () => void;
  onRetryFailed: () => void;
  isProcessing: boolean;
  progressDone: number;
  progressTotal: number;
  mediaList: MediaInfo[];
  processResult: ProcessResult | null;
  table: Table<MediaInfo>;
  columns: ColumnDef<MediaInfo>[];
  lightboxIndex: number | null;
  onSetLightboxIndex: (index: number | null) => void;
  showScrollToTop: boolean;
  onScrollToTop: () => void;
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
  progressDone,
  progressTotal,
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
    <div
      className="flex min-h-screen flex-col"
      style={{
        background: 'linear-gradient(180deg, #c8c8c8 0%, #b8b8b8 30%, #c0c0c0 100%)',
      }}
    >
      {/* Mock mode banner */}
      {isMockMode && (
        <div className="mock-banner px-4 py-2">
          <p
            className="text-center text-xs font-semibold"
            style={{
              color: '#c8901a',
              fontFamily: '"Courier New", monospace',
              letterSpacing: '0.08em',
            }}
          >
            ◆ MOCK MODE — UI PREVIEW / Tauri API disabled ◆
          </p>
        </div>
      )}

      {/* Nameplate header */}
      <Header isDark={isDark} onToggleDarkMode={onToggleDarkMode} />

      {/* Main control panel */}
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Top control section */}
        <section className="section-panel rounded-sm p-5">
          <div className="flex flex-col gap-4">
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

            {/* Action buttons — transport section */}
            <div
              className="flex justify-center gap-5 pt-3"
              style={{
                borderTop: '1px solid #909090',
              }}
            >
              <button
                onClick={onScanMedia}
                disabled={!inputDir || isScanning}
                className="btn-hardware btn-hardware-scan flex items-center gap-2 rounded px-8 py-2.5 disabled:opacity-40"
              >
                <HiOutlineMagnifyingGlass className="h-4 w-4" />
                {isScanning ? 'SCANNING...' : 'SCAN MEDIA'}
              </button>
              <button
                onClick={onProcessMedia}
                disabled={!inputDir || !outputDir || mediaList.length === 0 || isProcessing}
                className="btn-hardware btn-hardware-primary flex items-center gap-2 rounded px-8 py-2.5 disabled:opacity-40"
              >
                <HiOutlineCog className={`h-4 w-4 ${isProcessing ? 'animate-spin' : ''}`} />
                {isProcessing ? 'PROCESSING...' : 'PROCESS & RENAME'}
              </button>
            </div>

            {/* Overall progress bar — live during processing (#4) */}
            {isProcessing && progressTotal > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span
                    className="led-display text-xs"
                    style={{ color: '#44ff44', letterSpacing: '0.1em' }}
                  >
                    PROCESSING {String(progressDone).padStart(4, '0')} /{' '}
                    {String(progressTotal).padStart(4, '0')}
                  </span>
                  <span
                    className="led-display text-xs"
                    style={{ color: '#44ff44', letterSpacing: '0.1em' }}
                  >
                    {progressPercent(progressDone, progressTotal)}%
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-sm"
                  style={{ background: '#0a0a0a', border: '1px solid #222' }}
                  role="progressbar"
                  aria-valuenow={progressPercent(progressDone, progressTotal)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full transition-all duration-200"
                    style={{
                      width: `${progressPercent(progressDone, progressTotal)}%`,
                      background: 'linear-gradient(90deg, #2a8a2a, #44ff44)',
                      boxShadow: '0 0 6px rgba(68,255,68,0.6)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Process result summary */}
        {processResult && (
          <ProcessSummary
            processResult={processResult}
            mediaList={mediaList}
            onRetryFailed={onRetryFailed}
          />
        )}

        {/* Media file grid — LED display panel */}
        <section
          className="flex flex-col overflow-hidden rounded-sm"
          style={{
            background: '#111',
            border: '1px solid #333',
            borderTop: '2px solid #555',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          {/* Display panel header bar */}
          <div
            className="flex items-center gap-3 px-4 py-2"
            style={{
              background: 'linear-gradient(180deg, #282828, #1e1e1e)',
              borderBottom: '1px solid #0a0a0a',
            }}
          >
            <span className="label-channel" style={{ color: '#888', letterSpacing: '0.15em' }}>
              MEDIA FILES
            </span>
            {/* File count readout */}
            <span
              className="led-display led-amber-text text-xs"
              style={{ letterSpacing: '0.08em' }}
            >
              [{String(mediaList.length).padStart(4, '0')}]
            </span>
            <div className="flex-1" />
            {/* Status indicator dots */}
            {mediaList.length > 0 && (
              <div className="flex items-center gap-1.5">
                {mediaList.some((m) => m.status === 'completed') && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: '#44ff44', boxShadow: '0 0 4px rgba(68,255,68,0.8)' }}
                    title="Completed"
                  />
                )}
                {mediaList.some((m) => m.status === 'error') && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: '#ff3333', boxShadow: '0 0 4px rgba(255,51,51,0.8)' }}
                    title="Error"
                  />
                )}
                {mediaList.some((m) => m.status === 'pending') && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: '#ffaa00', boxShadow: '0 0 4px rgba(255,170,0,0.8)' }}
                    title="Pending"
                  />
                )}
              </div>
            )}
          </div>

          {mediaList.length === 0 ? (
            <div
              className="flex items-center justify-center py-16"
              style={{ background: '#0a0a0a' }}
            >
              <p
                className="led-display text-sm"
                style={{ color: '#2a2a2a', letterSpacing: '0.1em' }}
              >
                — NO MEDIA FILES LOADED — SELECT FOLDER AND SCAN —
              </p>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-auto" style={{ background: '#111' }}>
              <table className="w-full border-separate text-sm" style={{ borderSpacing: 0 }}>
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          style={{ width: header.getSize() }}
                          className="table-header-cell sticky top-0 z-20 px-2 py-2.5 text-left"
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
                        className="table-row-hover"
                        style={{
                          background: index % 2 === 0 ? '#1c1c1c' : '#181818',
                          borderBottom: '1px solid #222',
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className="px-2 py-2"
                            style={{ borderBottom: '1px solid #202020' }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {row.getIsExpanded() && (
                        <tr key={`${row.id}-expanded`}>
                          <td
                            colSpan={columns.length}
                            className="px-0 py-0"
                            style={{ background: '#0d0d0d', borderBottom: '1px solid #333' }}
                          >
                            <ProcessingFlow media={row.original} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Footer />
      </div>

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
