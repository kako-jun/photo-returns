import { useMemo } from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import {
  HiOutlineCamera,
  HiPhoto,
  HiFilm,
  HiChevronDown,
  HiChevronRight as HiChevronRightCollapsed,
  HiOutlineRectangleStack,
  HiOutlineBars3,
  HiOutlineSquare3Stack3D,
} from 'react-icons/hi2';
import type { MediaInfo } from '../types';
import { calculateNewName } from '../lib/newName';
import {
  supportsLosslessRotation,
  effectiveRotationMode,
  rotationDisplayDegrees,
} from '../lib/orientationQueue';
import { ImageWithFallback } from '../components/ImageWithFallback';

const columnHelper = createColumnHelper<MediaInfo>();

function getOrientationDegrees(orientation: number | null): string | null {
  if (!orientation) return null;
  switch (orientation) {
    case 1:
      return '0°';
    case 3:
      return '180°';
    case 6:
      return '90°';
    case 8:
      return '270°';
    default:
      return null;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useMemo<ColumnDef<MediaInfo, any>[]>(
    () => [
      // Expander
      columnHelper.display({
        id: 'expander',
        header: '',
        cell: ({ row }) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              row.toggleExpanded();
            }}
            className="expand-btn rounded p-1"
          >
            {row.getIsExpanded() ? (
              <HiChevronDown className="h-3.5 w-3.5" />
            ) : (
              <HiChevronRightCollapsed className="h-3.5 w-3.5" />
            )}
          </button>
        ),
        size: 40,
      }),

      // Row index
      columnHelper.display({
        id: 'index',
        header: '#',
        cell: (info) => (
          <span
            className="led-display font-semibold"
            style={{ color: '#555', fontSize: '0.65rem', letterSpacing: '0.04em' }}
          >
            {String(info.row.index + 1).padStart(3, '0')}
          </span>
        ),
        size: 50,
      }),

      // Before thumbnail
      columnHelper.display({
        id: 'before',
        header: 'Before',
        cell: (info) => {
          const mediaType = info.row.original.media_type;
          const originalPath = info.row.original.original_path;
          const rowIndex = info.row.index;

          if (isMockMode) {
            if (mediaType === 'Photo') {
              return (
                <button
                  onClick={() => setLightboxIndex(rowIndex)}
                  className="thumb-slot flex h-14 w-14 cursor-pointer items-center justify-center rounded-sm transition-opacity hover:opacity-75"
                  title="Click to view details (mock mode)"
                >
                  <HiPhoto className="h-7 w-7" style={{ color: '#444' }} />
                </button>
              );
            } else {
              return (
                <div className="thumb-slot flex h-14 w-14 items-center justify-center rounded-sm">
                  <HiFilm className="h-7 w-7" style={{ color: '#444' }} />
                </div>
              );
            }
          }

          if (mediaType === 'Photo') {
            const assetUrl = convertFileSrc(originalPath);
            const extLabel = (originalPath.split('.').pop() || '').toUpperCase();
            return (
              <button
                onClick={() => setLightboxIndex(rowIndex)}
                className="thumb-slot rounded-sm focus:outline-none"
                style={{ display: 'block' }}
                title="Click to view full size"
              >
                <ImageWithFallback
                  src={assetUrl}
                  alt="thumbnail"
                  className="h-14 w-14 cursor-pointer object-cover transition-opacity hover:opacity-75"
                  style={{ display: 'block' }}
                  loading="lazy"
                  fallback={
                    <div
                      className="flex h-14 w-14 flex-col items-center justify-center gap-0.5"
                      title={`Preview not available: ${extLabel}`}
                    >
                      <HiPhoto className="h-6 w-6" style={{ color: '#444' }} />
                      <span className="led-display" style={{ fontSize: '0.5rem', color: '#555' }}>
                        {extLabel || 'N/A'}
                      </span>
                    </div>
                  }
                />
              </button>
            );
          } else {
            return (
              <div className="thumb-slot flex h-14 w-14 items-center justify-center rounded-sm">
                <HiFilm className="h-7 w-7" style={{ color: '#664488' }} />
              </div>
            );
          }
        },
        size: 72,
      }),

      // Media type
      columnHelper.accessor('media_type', {
        header: 'Type',
        cell: (info) => {
          const hasExif = !!info.row.original.exif_date;
          const isPhoto = info.getValue() === 'Photo';
          return (
            <div className="flex items-center gap-1">
              <span className={isPhoto ? 'type-badge-photo' : 'type-badge-video'}>
                {isPhoto ? 'PHOTO' : 'VIDEO'}
              </span>
              {isPhoto && hasExif && (
                <HiOutlineCamera
                  className="h-3 w-3"
                  style={{ color: '#44ff44', filter: 'drop-shadow(0 0 3px rgba(68,255,68,0.6))' }}
                  title="EXIF data available"
                />
              )}
            </div>
          );
        },
        size: 110,
      }),

      // Original filename
      columnHelper.accessor('file_name', {
        header: 'Original Name',
        cell: (info) => (
          <button
            onClick={async () => {
              if (isMockMode) {
                alert('Mock mode: Cannot open file manager');
                return;
              }
              try {
                await invoke('reveal_in_filemanager', { path: info.row.original.original_path });
              } catch (err) {
                console.error('Failed to reveal file:', err);
                alert(`Failed to open file manager: ${err}`);
              }
            }}
            className="led-display cursor-pointer text-left transition-colors"
            style={{
              color: '#44aaff',
              fontSize: '0.7rem',
              letterSpacing: '0.02em',
            }}
            title={`Click to reveal: ${info.row.original.original_path}`}
          >
            {info.getValue()}
          </button>
        ),
        size: 250,
      }),

      // Date source selector
      columnHelper.accessor('date_source', {
        header: 'Date Source',
        cell: (info) => {
          const media = info.row.original;
          const currentSource = info.getValue();

          const availableSources: Array<{ value: string; label: string; date: string | null }> = [];
          if (media.exif_date)
            availableSources.push({ value: 'Exif', label: 'EXIF', date: media.exif_date });
          if (media.filename_date)
            availableSources.push({
              value: 'FileName',
              label: 'FILENAME',
              date: media.filename_date,
            });
          if (media.file_created_date)
            availableSources.push({
              value: 'FileCreated',
              label: 'CREATED',
              date: media.file_created_date,
            });
          if (media.file_modified_date)
            availableSources.push({
              value: 'FileModified',
              label: 'MODIFIED',
              date: media.file_modified_date,
            });

          const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
            const newSource = e.target.value;
            const selectedOption = availableSources.find((s) => s.value === newSource);
            if (selectedOption && selectedOption.date) {
              setMediaList((prevList) =>
                prevList.map((item, idx) =>
                  idx === info.row.index
                    ? {
                        ...item,
                        date_source: newSource as MediaInfo['date_source'],
                        date_taken: selectedOption.date,
                      }
                    : item
                )
              );
            }
          };

          const dotClass: Record<string, string> = {
            Exif: 'source-dot-exif',
            FileName: 'source-dot-filename',
            FileCreated: 'source-dot-created',
            FileModified: 'source-dot-modified',
            None: 'source-dot-none',
          };

          return (
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${dotClass[currentSource] || 'source-dot-none'}`}
              />
              <div className="relative">
                <select
                  value={currentSource}
                  onChange={handleSourceChange}
                  className="selector-hardware rounded px-1.5 py-0.5 pr-5"
                  style={{ fontSize: '0.65rem' }}
                >
                  {availableSources.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  {availableSources.length === 0 && <option value="None">NONE</option>}
                </select>
                <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-xs text-gray-600">
                  ▾
                </span>
              </div>
            </div>
          );
        },
        size: 130,
      }),

      // Date taken + TZ offset
      columnHelper.accessor('date_taken', {
        header: 'Date Taken',
        cell: (info) => {
          const date = info.getValue();
          const media = info.row.original;
          const exifTimezone = media.timezone;
          const selectedOffset = media.timezone_offset ?? 'none';

          if (!date)
            return (
              <span className="led-display" style={{ color: '#444', fontSize: '0.65rem' }}>
                N/A
              </span>
            );

          const d = new Date(date);
          const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

          const handleOffsetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
            setMediaList((prevList) =>
              prevList.map((item, idx) =>
                idx === info.row.index ? { ...item, timezone_offset: e.target.value } : item
              )
            );
          };

          return (
            <div className="flex flex-col gap-1">
              <span
                className="led-display"
                style={{ color: '#c0c0c0', fontSize: '0.68rem', letterSpacing: '0.03em' }}
              >
                {formatted}
              </span>
              {exifTimezone && (
                <span
                  className="led-display"
                  style={{ color: '#444', fontSize: '0.62rem' }}
                  title="EXIF Timezone (reference only)"
                >
                  EXIF TZ: {exifTimezone}
                </span>
              )}
              <div className="relative">
                <select
                  value={selectedOffset}
                  onChange={handleOffsetChange}
                  className="selector-hardware rounded px-1 py-0.5 pr-5"
                  style={{ fontSize: '0.62rem', width: '7rem' }}
                >
                  <option value="none">NONE</option>
                  <option value="exif">EXIF{exifTimezone ? ` (${exifTimezone})` : ''}</option>
                  {[
                    '-12:00',
                    '-11:00',
                    '-10:00',
                    '-09:00',
                    '-08:00',
                    '-07:00',
                    '-06:00',
                    '-05:00',
                    '-04:00',
                    '-03:00',
                    '-02:00',
                    '-01:00',
                    '+00:00',
                    '+01:00',
                    '+02:00',
                    '+03:00',
                    '+04:00',
                    '+05:00',
                    '+06:00',
                    '+07:00',
                    '+08:00',
                    '+09:00',
                    '+10:00',
                    '+11:00',
                    '+12:00',
                    '+13:00',
                    '+14:00',
                  ].map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-xs text-gray-600">
                  ▾
                </span>
              </div>
            </div>
          );
        },
        size: 200,
      }),

      // Burst group
      columnHelper.display({
        id: 'burst',
        header: 'Burst',
        cell: (info) => {
          const { burst_group_id, burst_index } = info.row.original;
          if (burst_group_id === null || burst_index === null) {
            return (
              <span className="led-display" style={{ color: '#333', fontSize: '0.65rem' }}>
                —
              </span>
            );
          }
          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <HiOutlineRectangleStack
                  className="h-3 w-3"
                  style={{ color: '#ffaa00', filter: 'drop-shadow(0 0 3px rgba(255,170,0,0.5))' }}
                  title="Burst group"
                />
                <span className="led-display" style={{ color: '#c0c0c0', fontSize: '0.65rem' }}>
                  G{burst_group_id}
                </span>
              </div>
              <span
                className="led-display font-bold"
                style={{
                  color: '#ffaa00',
                  fontSize: '0.65rem',
                  textShadow: '0 0 5px rgba(255,170,0,0.5)',
                }}
              >
                #{burst_index}
              </span>
            </div>
          );
        },
        size: 70,
      }),

      // Resolution / size
      columnHelper.display({
        id: 'resolution',
        header: 'Resolution',
        cell: (info) => {
          const { width, height, file_size } = info.row.original;
          const formattedSize =
            file_size > 1024 * 1024
              ? `${(file_size / (1024 * 1024)).toFixed(1)} MB`
              : `${(file_size / 1024).toFixed(1)} KB`;

          if (!width || !height) {
            return (
              <div className="flex flex-col gap-0.5">
                <span className="led-display" style={{ color: '#333', fontSize: '0.65rem' }}>
                  —
                </span>
                <span className="led-display" style={{ color: '#555', fontSize: '0.65rem' }}>
                  {formattedSize}
                </span>
              </div>
            );
          }

          const isPortrait = height > width;
          const isSquare = height === width;
          const isLandscape = width > height;
          const orientColor = isPortrait ? '#7ab0ff' : isLandscape ? '#a060ff' : '#44ff88';

          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                {isPortrait && (
                  <HiOutlineBars3
                    className="h-3.5 w-3.5 rotate-90"
                    style={{ color: orientColor }}
                    title="Portrait"
                  />
                )}
                {isLandscape && (
                  <HiOutlineBars3
                    className="h-3.5 w-3.5"
                    style={{ color: orientColor }}
                    title="Landscape"
                  />
                )}
                {isSquare && (
                  <HiOutlineSquare3Stack3D
                    className="h-3.5 w-3.5"
                    style={{ color: orientColor }}
                    title="Square"
                  />
                )}
                <span
                  className="led-display"
                  style={{ color: '#c0c0c0', fontSize: '0.65rem', letterSpacing: '0.02em' }}
                >
                  {width}×{height}
                </span>
              </div>
              <span className="led-display" style={{ color: '#666', fontSize: '0.62rem' }}>
                {formattedSize}
              </span>
            </div>
          );
        },
        size: 130,
      }),

      // Rotation selector
      columnHelper.display({
        id: 'rotation',
        header: 'Rotate',
        cell: (info) => {
          const media = info.row.original;
          const { exif_orientation } = media;
          const rotationSupported = supportsLosslessRotation(media);
          const rotationMode = effectiveRotationMode(media);
          const exifDegreesLabel = getOrientationDegrees(exif_orientation);

          const handleRotationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
            setMediaList((prevList) =>
              prevList.map((item, idx) =>
                idx === info.row.index
                  ? { ...item, rotation_mode: e.target.value as MediaInfo['rotation_mode'] }
                  : item
              )
            );
          };

          return (
            <div className="flex flex-col gap-1">
              {!rotationSupported ? (
                <span
                  className="led-display"
                  style={{ color: '#555', fontSize: '0.6rem' }}
                  title="この形式（HEIC/HEIF/AVIF）はロスレス回転に非対応のため回転できません"
                >
                  NO ROTATE (FMT)
                </span>
              ) : (
                exifDegreesLabel && (
                  <span
                    className="led-display"
                    style={{ color: '#555', fontSize: '0.62rem' }}
                    title="EXIF Orientation"
                  >
                    EXIF: {exifDegreesLabel}
                  </span>
                )
              )}
              <div className="relative" style={{ width: '7rem' }}>
                <select
                  value={rotationMode}
                  onChange={handleRotationChange}
                  disabled={!rotationSupported}
                  title={
                    rotationSupported
                      ? undefined
                      : 'この形式（HEIC/HEIF/AVIF）はロスレス回転に非対応のため回転できません'
                  }
                  className="selector-hardware w-full rounded px-1.5 py-0.5 pr-5"
                  style={{ fontSize: '0.65rem' }}
                >
                  <option value="none">NONE</option>
                  <option value="exif">
                    EXIF{exifDegreesLabel ? ` (${exifDegreesLabel})` : ''}
                  </option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
                <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-xs text-gray-600">
                  ▾
                </span>
              </div>
            </div>
          );
        },
        size: 110,
      }),

      // After (rotated preview)
      columnHelper.display({
        id: 'after',
        header: 'After',
        cell: (info) => {
          const media = info.row.original;
          const mediaType = media.media_type;
          const originalPath = media.original_path;

          // rotation_mode・EXIF Orientation・拡張子（ロスレス回転対応可否）から実角度を
          // 決める唯一のソース。HEIC/HEIF/AVIF は常に 0 を返す（backend が回転を skip
          // するため、プレビューも回さない実態と一致させる、#31）。
          const degrees = rotationDisplayDegrees(media);

          if (degrees === 0) {
            return (
              <div
                className="flex h-14 w-14 items-center justify-center"
                style={{
                  color: '#333',
                  fontSize: '0.7rem',
                  fontFamily: '"Courier New", monospace',
                }}
              >
                —
              </div>
            );
          }

          if (isMockMode) {
            if (mediaType === 'Photo') {
              return (
                <div
                  className="thumb-slot flex h-14 w-14 items-center justify-center rounded-sm"
                  style={{ transform: `rotate(${degrees}deg)` }}
                >
                  <HiPhoto className="h-7 w-7" style={{ color: '#444' }} />
                </div>
              );
            } else {
              return (
                <div
                  className="thumb-slot flex h-14 w-14 items-center justify-center rounded-sm"
                  style={{ transform: `rotate(${degrees}deg)` }}
                >
                  <HiFilm className="h-7 w-7" style={{ color: '#444' }} />
                </div>
              );
            }
          }

          if (mediaType === 'Photo') {
            const assetUrl = convertFileSrc(originalPath);
            const extLabel = (originalPath.split('.').pop() || '').toUpperCase();
            return (
              <div className="thumb-slot flex h-14 w-14 items-center justify-center overflow-hidden rounded-sm">
                <ImageWithFallback
                  src={assetUrl}
                  alt="rotated preview"
                  style={{
                    // 生ピクセルに対して回転させる（バックエンドの物理回転と一致）。
                    // imageOrientation:none を付けないと、ブラウザの EXIF 自動回転に
                    // CSS rotate が重なって二重回転になる（#7）。
                    imageOrientation: 'none',
                    transform: `rotate(${degrees}deg)`,
                    width: '56px',
                    height: '56px',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  loading="lazy"
                  fallback={
                    <div
                      className="flex h-14 w-14 flex-col items-center justify-center gap-0.5"
                      title={`Preview not available: ${extLabel}`}
                    >
                      <HiPhoto className="h-6 w-6" style={{ color: '#444' }} />
                      <span className="led-display" style={{ fontSize: '0.5rem', color: '#555' }}>
                        {extLabel || 'N/A'}
                      </span>
                    </div>
                  }
                />
              </div>
            );
          } else {
            return (
              <div
                className="thumb-slot flex h-14 w-14 items-center justify-center rounded-sm"
                style={{ transform: `rotate(${degrees}deg)` }}
              >
                <HiFilm className="h-7 w-7" style={{ color: '#664488' }} />
              </div>
            );
          }
        },
        size: 72,
      }),

      // New name
      columnHelper.accessor('new_name', {
        header: 'New Name',
        cell: (info) => {
          const media = info.row.original;
          const newPath = media.new_path;
          const hasNewPath = newPath && newPath !== '';

          // stem 組み立ての詳細（日時→バースト連番→タグの順、衝突連番は含めない理由）は
          // src/lib/newName.ts のコメントを参照（#29）。
          const newName = calculateNewName(media);
          const hasNewName = newName && newName !== 'unknown_date';

          return (
            <button
              onClick={async () => {
                if (isMockMode) {
                  alert('Mock mode: Cannot open file manager');
                  return;
                }
                if (!hasNewPath) {
                  alert('File has not been processed yet');
                  return;
                }
                try {
                  await invoke('reveal_in_filemanager', { path: newPath });
                } catch (err) {
                  console.error('Failed to reveal file:', err);
                  alert(`Failed to open file manager: ${err}`);
                }
              }}
              className="led-display text-left"
              style={{
                color: hasNewName ? '#44ff44' : '#333',
                fontSize: '0.68rem',
                letterSpacing: '0.02em',
                textShadow: hasNewName ? '0 0 6px rgba(68,255,68,0.35)' : 'none',
                cursor: hasNewPath ? 'pointer' : 'default',
              }}
              title={
                hasNewPath
                  ? `Click to reveal: ${newPath}`
                  : hasNewName
                    ? 'Preview name (not processed yet)'
                    : 'Not processed yet'
              }
            >
              {newName}
            </button>
          );
        },
        size: 210,
      }),

      // Status badge
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => {
          const status = info.getValue() || 'pending';
          return <span className={`led-badge led-badge-${status}`}>{status.toUpperCase()}</span>;
        },
        size: 90,
      }),

      // Progress VU meter
      columnHelper.display({
        id: 'progress',
        header: 'Progress',
        cell: (info) => {
          const progress = info.row.original.progress || 0;
          const status = info.row.original.status || 'pending';
          return (
            <div className="vu-meter-track relative h-5 w-full overflow-hidden rounded-sm">
              <div
                className={`vu-meter-fill-${status} h-full transition-all duration-300`}
                style={{ width: `${progress}%` }}
              />
              <span
                className="led-display absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold"
                style={{ fontSize: '0.6rem', color: '#c0c0c0', letterSpacing: '0.05em' }}
              >
                {progress}%
              </span>
            </div>
          );
        },
        size: 110,
      }),
    ],
    [setLightboxIndex, setMediaList, isMockMode]
  );
}
