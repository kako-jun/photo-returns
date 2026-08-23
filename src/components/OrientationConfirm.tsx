import { useEffect } from 'react';
import { HiXMark, HiPhoto, HiOutlineArrowUp } from 'react-icons/hi2';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { MediaInfo } from '../types';
import {
  exifDegrees,
  resolveRotationMode,
  type OrientationDirection,
  type AbsoluteRotationMode,
} from '../lib/orientationQueue';
import { ImageWithFallback } from './ImageWithFallback';

interface OrientationConfirmProps {
  /** 現在確認中の対象写真（mediaList から引き当て済み・rotation_mode は最新）。 */
  current: MediaInfo | null;
  /** 進捗表示用の 0 始まりインデックス。 */
  index: number;
  /** 進捗表示用の総件数。 */
  total: number;
  /** 4方向のいずれかで確定。確定した絶対 rotation_mode を返す（呼び出し側が auto-advance する）。 */
  onConfirm: (rotationMode: AbsoluteRotationMode) => void;
  /** 何もせず（rotation_mode 据え置き）次へ。 */
  onSkip: () => void;
  /** 途中終了（×・Esc）。 */
  onClose: () => void;
  isMockMode: boolean;
}

// 4方向ボタンの配置。意味は「現在表示中の画像の"上"は実際にはどの辺か」。
// アイコンは ↑ を各方向へ回して向きで示す（rotate は CSS のCW度）。
const DIRECTIONS: ReadonlyArray<{
  direction: OrientationDirection;
  label: string;
  key: string;
  /** グリッド配置（3x3 の中央十字）。 */
  gridArea: string;
  /** ↑アイコンを向ける角度（表示用、写像とは独立）。 */
  iconRotate: number;
}> = [
  {
    direction: 'up',
    label: '上が上（正しい）',
    key: '↑',
    gridArea: '1 / 2 / 2 / 3',
    iconRotate: 0,
  },
  { direction: 'left', label: '上は左辺', key: '←', gridArea: '2 / 1 / 3 / 2', iconRotate: 270 },
  { direction: 'right', label: '上は右辺', key: '→', gridArea: '2 / 3 / 3 / 4', iconRotate: 90 },
  {
    direction: 'down',
    label: '上は下辺（逆さ）',
    key: '↓',
    gridArea: '3 / 2 / 4 / 3',
    iconRotate: 180,
  },
];

export function OrientationConfirm({
  current,
  index,
  total,
  onConfirm,
  onSkip,
  onClose,
  isMockMode,
}: OrientationConfirmProps) {
  // current が存在する時だけ初期角を算出（hooks は無条件で呼ぶ）。
  const initialDeg = current ? exifDegrees(current.exif_orientation) : 0;

  // 矢印キー（↑→↓←）で確定、Space/Esc で Skip/閉じる。
  // App.tsx の LightBox と同様、関数本体ではなく useEffect 内で最新の props を参照し、
  // クリーンアップで必ず解除する（stale closure・listener 残留を防ぐ）。
  useEffect(() => {
    if (!current) return;

    const confirm = (direction: OrientationDirection) => {
      onConfirm(resolveRotationMode(initialDeg, direction));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          confirm('up');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          confirm('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          confirm('right');
          break;
        case 'ArrowDown':
          e.preventDefault();
          confirm('down');
          break;
        case ' ':
        case 'Spacebar': // 古いブラウザ互換
          e.preventDefault();
          onSkip();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // initialDeg は current/index に従属。onConfirm/onSkip/onClose は親で安定 or 最新参照。
  }, [current, index, initialDeg, onConfirm, onSkip, onClose]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      {/* Close button — hardware style */}
      <button
        onClick={onClose}
        className="btn-hardware absolute top-4 right-4 rounded p-2"
        style={{
          background: 'linear-gradient(180deg, #3a3a3a, #2a2a2a, #333)',
          borderColor: '#555',
          color: '#c0c0c0',
        }}
        title="Close (Esc)"
      >
        <HiXMark className="h-5 w-5" />
      </button>

      <div
        className="flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress + title */}
        <div className="text-center">
          <p
            className="led-display text-sm font-semibold"
            style={{ color: '#44ff44', letterSpacing: '0.08em' }}
          >
            CONFIRM ORIENTATION
          </p>
          <p className="led-display text-xs" style={{ color: '#888', letterSpacing: '0.04em' }}>
            「こっちが上」を選んでください（矢印キー / クリック）
          </p>
          <p className="led-display mt-1 text-xs" style={{ color: '#555' }}>
            [{index + 1} / {total}] — {current.file_name}
          </p>
        </div>

        {/* Preview — 生ピクセル + imageOrientation:none + CSS rotate(initialDeg) で
            EXIF補正済みの見え方を初期表示する（After プレビューと同じ手法）。 */}
        <div
          className="flex items-center justify-center overflow-hidden rounded-sm"
          style={{
            width: 'min(60vh, 60vw)',
            height: 'min(60vh, 60vw)',
            background: '#0a0a0a',
            border: '1px solid #333',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          }}
        >
          {isMockMode ? (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ transform: `rotate(${initialDeg}deg)` }}
            >
              <HiPhoto className="h-24 w-24" style={{ color: '#333' }} />
            </div>
          ) : (
            <ImageWithFallback
              src={convertFileSrc(current.original_path)}
              alt={current.file_name}
              style={{
                imageOrientation: 'none',
                transform: `rotate(${initialDeg}deg)`,
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
              fallback={
                <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                  <HiPhoto className="h-24 w-24" style={{ color: '#333' }} />
                  <p
                    className="led-display text-xs"
                    style={{ color: '#aa6600', textShadow: '0 0 6px rgba(180,120,0,0.4)' }}
                  >
                    ◆ PREVIEW NOT AVAILABLE
                  </p>
                </div>
              }
            />
          )}
        </div>

        {/* 4-way picker — 3x3 grid cross */}
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: 'repeat(3, 4rem)',
            gridTemplateRows: 'repeat(3, 4rem)',
          }}
        >
          {DIRECTIONS.map(({ direction, label, key, gridArea, iconRotate }) => (
            <button
              key={direction}
              onClick={() => onConfirm(resolveRotationMode(initialDeg, direction))}
              className="btn-hardware flex flex-col items-center justify-center gap-0.5 rounded"
              style={{
                gridArea,
                background: 'linear-gradient(180deg, #3a3a3a, #2a2a2a, #333)',
                borderColor: '#555',
                color: '#c0c0c0',
              }}
              title={`${key} ${label}`}
            >
              <HiOutlineArrowUp
                className="h-6 w-6"
                style={{ transform: `rotate(${iconRotate}deg)`, color: '#44ff44' }}
              />
              <span className="led-display" style={{ fontSize: '0.55rem', color: '#888' }}>
                {key}
              </span>
            </button>
          ))}
          {/* center label */}
          <div className="flex items-center justify-center" style={{ gridArea: '2 / 2 / 3 / 3' }}>
            <span className="led-display" style={{ fontSize: '0.6rem', color: '#444' }}>
              UP?
            </span>
          </div>
        </div>

        {/* Skip / hint */}
        <div className="flex items-center gap-3">
          <button
            onClick={onSkip}
            className="btn-hardware rounded px-6 py-2"
            style={{
              background: 'linear-gradient(180deg, #3a3a3a, #2a2a2a, #333)',
              borderColor: '#555',
              color: '#c0c0c0',
            }}
            title="Skip — 何もせず次へ (Space)"
          >
            <span className="led-display text-xs" style={{ letterSpacing: '0.06em' }}>
              SKIP (Space)
            </span>
          </button>
          <span className="led-display text-xs" style={{ color: '#555' }}>
            Esc で終了
          </span>
        </div>
      </div>
    </div>
  );
}
