import { HiXMark, HiChevronLeft, HiChevronRight, HiPhoto } from "react-icons/hi2";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { MediaInfo } from "../types";

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
        className="absolute top-4 right-4 text-white hover:text-gray-300 p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-70 transition-all"
        title="Close (ESC)"
      >
        <HiXMark className="w-8 h-8" />
      </button>

      {currentIndex > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrevious();
          }}
          className="absolute left-4 text-white hover:text-gray-300 p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-70 transition-all"
          title="Previous (←)"
        >
          <HiChevronLeft className="w-8 h-8" />
        </button>
      )}

      {currentIndex < mediaList.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
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
        {isMockMode ? (
          // モックモード：画像の代わりに情報を表示
          <div className="bg-gray-800 rounded-lg p-8 shadow-2xl">
            <HiPhoto className="w-32 h-32 text-gray-400 mx-auto mb-4" />
            <div className="text-white space-y-2">
              <p className="font-semibold text-xl">{currentMedia.file_name}</p>
              <p className="text-gray-300">Type: {currentMedia.media_type}</p>
              <p className="text-gray-300">Size: {(currentMedia.file_size / (1024 * 1024)).toFixed(2)} MB</p>
              {currentMedia.width && currentMedia.height && (
                <p className="text-gray-300">
                  Resolution: {currentMedia.width} × {currentMedia.height}
                </p>
              )}
              <p className="text-sm text-gray-400 mt-4">
                {currentIndex + 1} / {mediaList.length}
              </p>
              <p className="text-xs text-yellow-400 mt-2">
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
              className="max-w-full max-h-[80vh] object-contain rounded shadow-2xl"
            />
            <div className="mt-4 text-center text-white bg-black bg-opacity-70 px-4 py-2 rounded">
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
