import { HiPhoto, HiFilm, HiChevronDown } from 'react-icons/hi2';

interface DefaultSettingsProps {
  // Photo settings
  defaultPhotoDateSource: 'Exif' | 'FileName' | 'FileCreated' | 'FileModified';
  defaultPhotoTimezoneOffset: string;
  defaultPhotoRotationMode: 'none' | 'exif' | '90' | '180' | '270';
  onPhotoDateSourceChange: (value: 'Exif' | 'FileName' | 'FileCreated' | 'FileModified') => void;
  onPhotoTimezoneOffsetChange: (value: string) => void;
  onPhotoRotationModeChange: (value: 'none' | 'exif' | '90' | '180' | '270') => void;

  // Video settings
  defaultVideoDateSource: 'Exif' | 'FileName' | 'FileCreated' | 'FileModified';
  defaultVideoTimezoneOffset: string;
  defaultVideoRotationMode: 'none' | 'exif' | '90' | '180' | '270';
  onVideoDateSourceChange: (value: 'Exif' | 'FileName' | 'FileCreated' | 'FileModified') => void;
  onVideoTimezoneOffsetChange: (value: string) => void;
  onVideoRotationModeChange: (value: 'none' | 'exif' | '90' | '180' | '270') => void;
}

export function DefaultSettings({
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
}: DefaultSettingsProps) {
  return (
    <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Default Settings
      </h3>
      <div className="grid grid-cols-2 gap-6">
        {/* 静止画の設定 */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
          <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
            <HiPhoto className="h-4 w-4" />
            Photo
          </h4>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">
                Date Source:
              </label>
              <div className="relative flex-1">
                <select
                  value={defaultPhotoDateSource}
                  onChange={(e) => onPhotoDateSourceChange(e.target.value as any)}
                  className="w-full cursor-pointer appearance-none rounded border border-gray-300 bg-white px-2 py-1 pr-6 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option
                    value="Exif"
                    className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  >
                    EXIF
                  </option>
                  <option
                    value="FileName"
                    className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  >
                    FileName
                  </option>
                  <option
                    value="FileCreated"
                    className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  >
                    Created
                  </option>
                  <option
                    value="FileModified"
                    className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  >
                    Modified
                  </option>
                </select>
                <HiChevronDown className="pointer-events-none absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">
                TZ Correction:
              </label>
              <div className="relative flex-1">
                <select
                  value={defaultPhotoTimezoneOffset}
                  onChange={(e) => onPhotoTimezoneOffsetChange(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded border border-gray-300 bg-white px-2 py-1 pr-6 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
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
                <HiChevronDown className="pointer-events-none absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">
                Rotation:
              </label>
              <div className="relative flex-1">
                <select
                  value={defaultPhotoRotationMode}
                  onChange={(e) => onPhotoRotationModeChange(e.target.value as any)}
                  className="w-full cursor-pointer appearance-none rounded border border-gray-300 bg-white px-2 py-1 pr-6 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="none">None</option>
                  <option value="exif">EXIF</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
                <HiChevronDown className="pointer-events-none absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        {/* 動画の設定 */}
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/10">
          <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold text-purple-700 dark:text-purple-300">
            <HiFilm className="h-4 w-4" />
            Video
          </h4>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">
                Date Source:
              </label>
              <div className="relative flex-1">
                <select
                  value={defaultVideoDateSource}
                  onChange={(e) => onVideoDateSourceChange(e.target.value as any)}
                  className="w-full cursor-pointer appearance-none rounded border border-gray-300 bg-white px-2 py-1 pr-6 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option
                    value="FileName"
                    className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  >
                    FileName
                  </option>
                  <option
                    value="FileCreated"
                    className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  >
                    Created
                  </option>
                  <option
                    value="FileModified"
                    className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  >
                    Modified
                  </option>
                </select>
                <HiChevronDown className="pointer-events-none absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">
                TZ Correction:
              </label>
              <div className="relative flex-1">
                <select
                  value={defaultVideoTimezoneOffset}
                  onChange={(e) => onVideoTimezoneOffsetChange(e.target.value)}
                  className="w-full cursor-pointer appearance-none rounded border border-gray-300 bg-white px-2 py-1 pr-6 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
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
                <HiChevronDown className="pointer-events-none absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">
                Rotation:
              </label>
              <div className="relative flex-1">
                <select
                  value={defaultVideoRotationMode}
                  onChange={(e) => onVideoRotationModeChange(e.target.value as any)}
                  className="w-full cursor-pointer appearance-none rounded border border-gray-300 bg-white px-2 py-1 pr-6 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="none">None</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
                <HiChevronDown className="pointer-events-none absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
