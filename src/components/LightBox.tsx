import { HiXMark, HiChevronLeft, HiChevronRight, HiPhoto } from 'react-icons/hi2';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { MediaInfo } from '../types';
import { ImageWithFallback } from './ImageWithFallback';

interface LightBoxProps {
  mediaList: MediaInfo[];
  currentIndex: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  isMockMode: boolean;
}

export function LightBox({
  mediaList,
  currentIndex,
  onClose,
  onPrevious,
  onNext,
  isMockMode,
}: LightBoxProps) {
  const currentMedia = mediaList[currentIndex];
  if (!currentMedia) return null;

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
        title="Close (ESC)"
      >
        <HiXMark className="h-5 w-5" />
      </button>

      {currentIndex > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrevious();
          }}
          className="btn-hardware absolute left-4 rounded p-2"
          style={{
            background: 'linear-gradient(180deg, #3a3a3a, #2a2a2a, #333)',
            borderColor: '#555',
            color: '#c0c0c0',
          }}
          title="Previous (←)"
        >
          <HiChevronLeft className="h-5 w-5" />
        </button>
      )}

      {currentIndex < mediaList.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="btn-hardware absolute right-4 rounded p-2"
          style={{
            background: 'linear-gradient(180deg, #3a3a3a, #2a2a2a, #333)',
            borderColor: '#555',
            color: '#c0c0c0',
          }}
          title="Next (→)"
        >
          <HiChevronRight className="h-5 w-5" />
        </button>
      )}

      <div
        className="flex max-h-[90vh] max-w-[90vw] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isMockMode ? (
          <div
            className="rounded-sm p-8"
            style={{
              background: 'linear-gradient(180deg, #1e1e1e, #181818)',
              border: '1px solid #333',
              boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
            }}
          >
            <HiPhoto className="mx-auto mb-4 h-24 w-24" style={{ color: '#333' }} />
            <div className="space-y-2">
              <p
                className="led-display text-base font-semibold"
                style={{ color: '#c0c0c0', letterSpacing: '0.06em' }}
              >
                {currentMedia.file_name}
              </p>
              <p className="led-display text-xs" style={{ color: '#666' }}>
                TYPE: {currentMedia.media_type.toUpperCase()}
              </p>
              <p className="led-display text-xs" style={{ color: '#666' }}>
                SIZE: {(currentMedia.file_size / (1024 * 1024)).toFixed(2)} MB
              </p>
              {currentMedia.width && currentMedia.height && (
                <p className="led-display text-xs" style={{ color: '#666' }}>
                  RES: {currentMedia.width} × {currentMedia.height}
                </p>
              )}
              <p className="led-display mt-4 text-xs" style={{ color: '#444' }}>
                [{currentIndex + 1} / {mediaList.length}]
              </p>
              <p
                className="led-display mt-2 text-xs"
                style={{ color: '#aa6600', textShadow: '0 0 6px rgba(180,120,0,0.4)' }}
              >
                ◆ MOCK MODE: Image preview not available
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative flex max-h-[80vh] max-w-full items-center justify-center">
              <ImageWithFallback
                src={convertFileSrc(currentMedia.original_path)}
                alt={currentMedia.file_name}
                className="max-h-[80vh] max-w-full object-contain"
                style={{
                  border: '1px solid #333',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                }}
                fallback={
                  <div
                    className="flex flex-col items-center justify-center gap-2 rounded-sm p-8"
                    style={{
                      background: 'linear-gradient(180deg, #1e1e1e, #181818)',
                      border: '1px solid #333',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                    }}
                  >
                    <HiPhoto className="h-24 w-24" style={{ color: '#333' }} />
                    <p
                      className="led-display text-base font-semibold"
                      style={{ color: '#c0c0c0', letterSpacing: '0.06em' }}
                    >
                      {currentMedia.file_name}
                    </p>
                    <p
                      className="led-display text-xs"
                      style={{ color: '#aa6600', textShadow: '0 0 6px rgba(180,120,0,0.4)' }}
                    >
                      ◆ PREVIEW NOT AVAILABLE:{' '}
                      {(currentMedia.file_name.split('.').pop() || 'UNKNOWN').toUpperCase()}
                    </p>
                  </div>
                }
              />
            </div>
            <div
              className="mt-3 rounded-sm px-5 py-2 text-center"
              style={{
                background: 'rgba(0,0,0,0.8)',
                border: '1px solid #2a2a2a',
              }}
            >
              <p className="led-display text-sm font-semibold" style={{ color: '#c0c0c0' }}>
                {currentMedia.file_name}
              </p>
              <p className="led-display text-xs" style={{ color: '#555' }}>
                [{currentIndex + 1} / {mediaList.length}]
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
