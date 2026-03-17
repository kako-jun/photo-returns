import { HiOutlineFolderOpen } from 'react-icons/hi2';

interface DirectorySelectionProps {
  inputDir: string;
  outputDir: string;
  onSelectInputDir: () => void;
  onSelectOutputDir: () => void;
}

function ChannelStrip({
  label,
  value,
  placeholder,
  onSelect,
  accentColor,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSelect: () => void;
  accentColor: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Channel label */}
      <div className="flex min-w-[120px] flex-col items-end gap-0.5">
        <span
          className="label-channel"
          style={{ color: accentColor, textShadow: `0 0 6px ${accentColor}40` }}
        >
          {label}
        </span>
        {/* LED pip */}
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: value ? '#44ff44' : '#333',
            boxShadow: value ? '0 0 4px rgba(68,255,68,0.8)' : 'none',
          }}
        />
      </div>

      {/* Path display — recessed readout */}
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          readOnly
          placeholder={placeholder}
          className="input-recessed w-full rounded px-3 py-2 text-xs"
        />
      </div>

      {/* Browse button */}
      <button
        onClick={onSelect}
        className="btn-hardware flex items-center gap-1.5 rounded px-4 py-2"
      >
        <HiOutlineFolderOpen className="h-4 w-4" />
        <span>BROWSE</span>
      </button>
    </div>
  );
}

export function DirectorySelection({
  inputDir,
  outputDir,
  onSelectInputDir,
  onSelectOutputDir,
}: DirectorySelectionProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Section label */}
      <div className="flex items-center gap-2 pb-1">
        <span className="label-engraved">I/O Routing</span>
        <div
          className="flex-1"
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, #707070, transparent)',
          }}
        />
      </div>

      <ChannelStrip
        label="INPUT DIR"
        value={inputDir}
        placeholder="— SELECT SOURCE FOLDER —"
        onSelect={onSelectInputDir}
        accentColor="#44aaff"
      />
      <ChannelStrip
        label="OUTPUT DIR"
        value={outputDir}
        placeholder="— SELECT DESTINATION FOLDER —"
        onSelect={onSelectOutputDir}
        accentColor="#44ff44"
      />
    </div>
  );
}
