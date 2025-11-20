import { HiXMark, HiChevronLeft, HiChevronRight, HiPhoto } from 'react-icons/hi2';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { MediaInfo } from '../types';

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
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="bg-opacity-50 hover:bg-opacity-70 absolute top-4 right-4 rounded-full bg-black p-2 text-white transition-all hover:text-gray-300"
        title="Close (ESC)"
      >
        <HiXMark className="h-8 w-8" />
      </button>

      {currentIndex > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrevious();
          }}
          className="bg-opacity-50 hover:bg-opacity-70 absolute left-4 rounded-full bg-black p-2 text-white transition-all hover:text-gray-300"
          title="Previous (←)"
        >
          <HiChevronLeft className="h-8 w-8" />
        </button>
      )}

      {currentIndex < mediaList.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="bg-opacity-50 hover:bg-opacity-70 absolute right-4 rounded-full bg-black p-2 text-white transition-all hover:text-gray-300"
          title="Next (→)"
        >
          <HiChevronRight className="h-8 w-8" />
        </button>
      )}

      <div
        className="flex max-h-[90vh] max-w-[90vw] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isMockMode ? (
          // モックモード：画像の代わりに情報を表示
          <div className="rounded-lg bg-gray-800 p-8 shadow-2xl">
            <HiPhoto className="mx-auto mb-4 h-32 w-32 text-gray-400" />
            <div className="space-y-2 text-white">
              <p className="text-xl font-semibold">{currentMedia.file_name}</p>
              <p className="text-gray-300">Type: {currentMedia.media_type}</p>
              <p className="text-gray-300">
                Size: {(currentMedia.file_size / (1024 * 1024)).toFixed(2)} MB
              </p>
              {currentMedia.width && currentMedia.height && (
                <p className="text-gray-300">
                  Resolution: {currentMedia.width} × {currentMedia.height}
                </p>
              )}
              <p className="mt-4 text-sm text-gray-400">
                {currentIndex + 1} / {mediaList.length}
              </p>
              <p className="mt-2 text-xs text-yellow-400">
                🎨 Mock Mode: Image preview not available
              </p>
            </div>
          </div>
        ) : (
          // 実際のモード：画像を表示
          <>
            <img
              src={convertFileSrc(currentMedia.original_path)}
              alt={currentMedia.file_name}
              className="max-h-[80vh] max-w-full rounded object-contain shadow-2xl"
            />
            <div className="bg-opacity-70 mt-4 rounded bg-black px-4 py-2 text-center text-white">
              <p className="font-semibold">{currentMedia.file_name}</p>
              <p className="text-sm text-gray-300">
                {currentIndex + 1} / {mediaList.length}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
