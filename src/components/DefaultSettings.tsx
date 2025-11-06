import { HiPhoto, HiFilm, HiChevronDown } from "react-icons/hi2";

interface DefaultSettingsProps {
  // Photo settings
  defaultPhotoDateSource: "Exif" | "FileName" | "FileCreated" | "FileModified";
  defaultPhotoTimezoneOffset: string;
  defaultPhotoRotationMode: "none" | "exif" | "90" | "180" | "270";
  onPhotoDateSourceChange: (value: "Exif" | "FileName" | "FileCreated" | "FileModified") => void;
  onPhotoTimezoneOffsetChange: (value: string) => void;
  onPhotoRotationModeChange: (value: "none" | "exif" | "90" | "180" | "270") => void;

  // Video settings
  defaultVideoDateSource: "Exif" | "FileName" | "FileCreated" | "FileModified";
  defaultVideoTimezoneOffset: string;
  defaultVideoRotationMode: "none" | "exif" | "90" | "180" | "270";
  onVideoDateSourceChange: (value: "Exif" | "FileName" | "FileCreated" | "FileModified") => void;
  onVideoTimezoneOffsetChange: (value: string) => void;
  onVideoRotationModeChange: (value: "none" | "exif" | "90" | "180" | "270") => void;
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
              <div className="relative flex-1">
                <select
                  value={defaultPhotoDateSource}
                  onChange={(e) => onPhotoDateSourceChange(e.target.value as any)}
                  className="appearance-none w-full px-2 py-1 pr-6 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                >
                  <option value="Exif" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">EXIF</option>
                  <option value="FileName" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">FileName</option>
                  <option value="FileCreated" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Created</option>
                  <option value="FileModified" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Modified</option>
                </select>
                <HiChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-600 dark:text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">TZ Correction:</label>
              <div className="relative flex-1">
                <select
                  value={defaultPhotoTimezoneOffset}
                  onChange={(e) => onPhotoTimezoneOffsetChange(e.target.value)}
                  className="appearance-none w-full px-2 py-1 pr-6 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
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
              <HiChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-600 dark:text-gray-400" />
            </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">Rotation:</label>
              <div className="relative flex-1">
                <select
                  value={defaultPhotoRotationMode}
                  onChange={(e) => onPhotoRotationModeChange(e.target.value as any)}
                  className="appearance-none w-full px-2 py-1 pr-6 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                >
                  <option value="none">None</option>
                  <option value="exif">EXIF</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
                <HiChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-600 dark:text-gray-400" />
              </div>
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
              <div className="relative flex-1">
                <select
                  value={defaultVideoDateSource}
                  onChange={(e) => onVideoDateSourceChange(e.target.value as any)}
                  className="appearance-none w-full px-2 py-1 pr-6 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                >
                  <option value="FileName" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">FileName</option>
                  <option value="FileCreated" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Created</option>
                  <option value="FileModified" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Modified</option>
                </select>
                <HiChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-600 dark:text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">TZ Correction:</label>
              <div className="relative flex-1">
                <select
                  value={defaultVideoTimezoneOffset}
                  onChange={(e) => onVideoTimezoneOffsetChange(e.target.value)}
                  className="appearance-none w-full px-2 py-1 pr-6 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
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
                <HiChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-600 dark:text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-[80px] text-xs font-medium text-gray-700 dark:text-gray-300">Rotation:</label>
              <div className="relative flex-1">
                <select
                  value={defaultVideoRotationMode}
                  onChange={(e) => onVideoRotationModeChange(e.target.value as any)}
                  className="appearance-none w-full px-2 py-1 pr-6 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
                >
                  <option value="none">None</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
                <HiChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
