import { HiPhoto, HiFilm } from 'react-icons/hi2';

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

  // System settings — photo/video のどちらのチャンネルにも属さない全体設定（#28）
  /** システム生成物を scan_media で除外するかどうか。既定 true。 */
  excludeSystemArtifacts: boolean;
  onExcludeSystemArtifactsChange: (value: boolean) => void;

  // 由来タグ設定 — photo/video のどちらのチャンネルにも属さない全体設定（#29）
  /** 明示ラベル。空文字ならタグなし（フォルダ由来フォールバック次第）。 */
  provenanceTag: string;
  onProvenanceTagChange: (value: string) => void;
  /** ラベル未指定時にフォルダ名へフォールバックするか。既定 false。 */
  provenanceFromFolder: boolean;
  onProvenanceFromFolderChange: (value: boolean) => void;
}

function SelectorRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="label-channel min-w-[72px]">{label}</label>
      {children}
    </div>
  );
}

const tzOptions = [
  'none',
  'exif',
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
];

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
  excludeSystemArtifacts,
  onExcludeSystemArtifactsChange,
  provenanceTag,
  onProvenanceTagChange,
  provenanceFromFolder,
  onProvenanceFromFolderChange,
}: DefaultSettingsProps) {
  return (
    <div
      className="pt-3"
      style={{
        borderTop: '1px solid #909090',
        borderTopColor: '#888',
      }}
    >
      {/* Section label */}
      <div className="mb-3 flex items-center gap-2">
        <span className="label-engraved">Default Settings</span>
        <div
          className="flex-1"
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, #707070, transparent)',
          }}
        />
      </div>

      {/* システム生成物の除外トグル（#28）。写真/動画どちらのチャンネルにも属さない
          全体設定なので、2カラムグリッド（Photo/Video）の外に独立行として置く。 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={excludeSystemArtifacts}
            onChange={(e) => onExcludeSystemArtifactsChange(e.target.checked)}
            className="checkbox-hardware"
          />
          <span className="label-channel">EXCLUDE SYSTEM ARTIFACTS</span>
        </label>
        <span
          className="text-[0.6rem]"
          style={{ color: '#888', fontFamily: '"Courier New", monospace' }}
        >
          (.trashed-*, .thumbnails/, .nomedia, ._*, .DS_Store, Thumbs.db)
        </span>
      </div>

      {/* 由来タグ設定（#29）。写真/動画どちらのチャンネルにも属さない全体設定なので、
          除外トグルと同様に2カラムグリッドの外に独立行として置く。 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="label-channel min-w-[72px]">PROVENANCE TAG</label>
        <input
          type="text"
          value={provenanceTag}
          onChange={(e) => onProvenanceTagChange(e.target.value)}
          placeholder="e.g. takeout, line, pixel8"
          className="input-recessed rounded px-2 py-1 text-xs"
          style={{ width: '180px' }}
        />
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={provenanceFromFolder}
            onChange={(e) => onProvenanceFromFolderChange(e.target.checked)}
            className="checkbox-hardware"
          />
          <span className="label-channel">USE FOLDER NAME IF LABEL EMPTY</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Photo channel */}
        <div className="settings-panel-photo rounded p-3">
          <h4 className="mb-2.5 flex items-center gap-1.5">
            <HiPhoto className="h-3.5 w-3.5" style={{ color: '#6090d0' }} />
            <span
              className="label-channel"
              style={{ color: '#6090d0', textShadow: '0 0 6px rgba(80,130,220,0.5)' }}
            >
              Photo Channel
            </span>
          </h4>

          <div className="flex flex-col gap-2">
            <SelectorRow label="DATE SRC">
              <div className="relative flex-1">
                <select
                  value={defaultPhotoDateSource}
                  onChange={(e) =>
                    onPhotoDateSourceChange(
                      e.target.value as 'Exif' | 'FileName' | 'FileCreated' | 'FileModified'
                    )
                  }
                  className="selector-hardware w-full rounded px-2 py-1 pr-6"
                >
                  <option value="Exif">EXIF</option>
                  <option value="FileName">FILENAME</option>
                  <option value="FileCreated">CREATED</option>
                  <option value="FileModified">MODIFIED</option>
                </select>
                <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-gray-500">
                  ▾
                </span>
              </div>
            </SelectorRow>

            <SelectorRow label="TZ CORR">
              <div className="relative flex-1">
                <select
                  value={defaultPhotoTimezoneOffset}
                  onChange={(e) => onPhotoTimezoneOffsetChange(e.target.value)}
                  className="selector-hardware w-full rounded px-2 py-1 pr-6"
                >
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.toUpperCase()}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-gray-500">
                  ▾
                </span>
              </div>
            </SelectorRow>

            <SelectorRow label="ROTATION">
              <div className="relative flex-1">
                <select
                  value={defaultPhotoRotationMode}
                  onChange={(e) =>
                    onPhotoRotationModeChange(
                      e.target.value as 'none' | 'exif' | '90' | '180' | '270'
                    )
                  }
                  className="selector-hardware w-full rounded px-2 py-1 pr-6"
                >
                  <option value="none">NONE</option>
                  <option value="exif">EXIF</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
                <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-gray-500">
                  ▾
                </span>
              </div>
            </SelectorRow>
          </div>
        </div>

        {/* Video channel */}
        <div className="settings-panel-video rounded p-3">
          <h4 className="mb-2.5 flex items-center gap-1.5">
            <HiFilm className="h-3.5 w-3.5" style={{ color: '#a060d0' }} />
            <span
              className="label-channel"
              style={{ color: '#a060d0', textShadow: '0 0 6px rgba(160,80,220,0.5)' }}
            >
              Video Channel
            </span>
          </h4>

          <div className="flex flex-col gap-2">
            <SelectorRow label="DATE SRC">
              <div className="relative flex-1">
                <select
                  value={defaultVideoDateSource}
                  onChange={(e) =>
                    onVideoDateSourceChange(
                      e.target.value as 'Exif' | 'FileName' | 'FileCreated' | 'FileModified'
                    )
                  }
                  className="selector-hardware w-full rounded px-2 py-1 pr-6"
                >
                  <option value="Exif">EXIF</option>
                  <option value="FileName">FILENAME</option>
                  <option value="FileCreated">CREATED</option>
                  <option value="FileModified">MODIFIED</option>
                </select>
                <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-gray-500">
                  ▾
                </span>
              </div>
            </SelectorRow>

            <SelectorRow label="TZ CORR">
              <div className="relative flex-1">
                <select
                  value={defaultVideoTimezoneOffset}
                  onChange={(e) => onVideoTimezoneOffsetChange(e.target.value)}
                  className="selector-hardware w-full rounded px-2 py-1 pr-6"
                >
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.toUpperCase()}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-gray-500">
                  ▾
                </span>
              </div>
            </SelectorRow>

            <SelectorRow label="ROTATION">
              <div className="relative flex-1">
                <select
                  value={defaultVideoRotationMode}
                  onChange={(e) =>
                    onVideoRotationModeChange(
                      e.target.value as 'none' | 'exif' | '90' | '180' | '270'
                    )
                  }
                  className="selector-hardware w-full rounded px-2 py-1 pr-6"
                >
                  <option value="none">NONE</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
                <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-gray-500">
                  ▾
                </span>
              </div>
            </SelectorRow>
          </div>
        </div>
      </div>
    </div>
  );
}
