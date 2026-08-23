import { useState } from 'react';
import { HiDocumentText } from 'react-icons/hi2';
import type { MediaInfo } from '../types';
import { LogViewer } from './LogViewer';
import { supportsLosslessRotation, effectiveRotationMode } from '../lib/orientationQueue';

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

export function ProcessingFlow({ media }: { media: MediaInfo }) {
  const [showLogViewer, setShowLogViewer] = useState(false);
  const isError = media.status === 'error';
  const isCompleted = media.status === 'completed';
  const isProcessing = media.status === 'processing';

  type StepStatus = 'success' | 'error' | 'skip' | 'pending';

  interface ProcessingStep {
    label: string;
    status: StepStatus;
    details: string;
  }

  const steps: ProcessingStep[] = [];

  steps.push({
    label: 'Input File',
    status: 'success',
    details: `${media.file_name} (${(media.file_size / (1024 * 1024)).toFixed(2)} MB)`,
  });

  if (media.date_taken) {
    steps.push({
      label: 'Date Source',
      status: 'success',
      details: `${media.date_source} → ${new Date(media.date_taken).toLocaleString()}`,
    });
  } else {
    steps.push({ label: 'Date Source', status: 'error', details: 'No date found' });
  }

  if (media.burst_group_id !== null) {
    steps.push({
      label: 'Burst Detection',
      status: 'success',
      details: `Group ${media.burst_group_id}, Index ${media.burst_index}`,
    });
  } else {
    steps.push({ label: 'Burst Detection', status: 'skip', details: 'Not in burst group' });
  }

  if (media.timezone_offset && media.timezone_offset !== 'none') {
    steps.push({
      label: 'TZ Correction',
      status: 'success',
      details: `Applied ${media.timezone_offset === 'exif' ? 'EXIF' : media.timezone_offset}`,
    });
  } else {
    steps.push({ label: 'TZ Correction', status: 'skip', details: 'Not applied' });
  }

  if (media.new_name) {
    steps.push({ label: 'File Naming', status: 'success', details: media.new_name });
  } else {
    steps.push({ label: 'File Naming', status: 'error', details: 'Name generation failed' });
  }

  // HEIC/HEIF/AVIF はロスレス回転に非対応で backend が回転を丸ごと skip するため
  // （orientation::supports_lossless_rotation, #31）、rotation_mode の値によらず
  // 「pending のまま」ではなく明示的に skip として表示する。判定は Rotate 列・After
  // プレビューと同じ orientationQueue.ts の関数を再利用する。
  const rotationSupported = supportsLosslessRotation(media);
  const rotationMode = effectiveRotationMode(media);
  if (!rotationSupported) {
    steps.push({
      label: 'Rotation',
      status: 'skip',
      details: 'Lossless rotation not supported for this format (HEIC/HEIF/AVIF)',
    });
  } else if (rotationMode !== 'none') {
    const degrees =
      rotationMode === 'exif' ? getOrientationDegrees(media.exif_orientation) : rotationMode;
    steps.push({
      label: 'Rotation',
      status: media.rotation_applied ? 'success' : 'pending',
      details: `Rotate ${degrees}`,
    });
  } else {
    steps.push({ label: 'Rotation', status: 'skip', details: 'No rotation needed' });
  }

  if (media.new_path) {
    const pathParts = media.new_path.split(/[\\/]/);
    const year = pathParts[pathParts.length - 4];
    const month = pathParts[pathParts.length - 3];
    const day = pathParts[pathParts.length - 2];
    steps.push({
      label: 'Directory Creation',
      status: 'success',
      details: `${year} / ${month} / ${day}`,
    });
  } else {
    steps.push({ label: 'Directory Creation', status: 'pending', details: 'Pending' });
  }

  if (isCompleted) {
    steps.push({
      label: 'File Processing',
      status: 'success',
      details: 'File copied successfully',
    });
  } else if (isProcessing) {
    steps.push({ label: 'File Processing', status: 'pending', details: 'Processing...' });
  } else if (isError) {
    steps.push({
      label: 'File Processing',
      status: 'error',
      details: media.error_message || 'Unknown error',
    });
  } else {
    steps.push({ label: 'File Processing', status: 'pending', details: 'Waiting to start' });
  }

  if (isCompleted) {
    steps.push({ label: 'Complete', status: 'success', details: 'Successfully processed' });
  } else if (isError) {
    steps.push({
      label: 'Error',
      status: 'error',
      details: media.error_message || 'Processing failed',
    });
  } else {
    steps.push({ label: 'Status', status: 'pending', details: media.status || 'pending' });
  }

  const midPoint = Math.ceil(steps.length / 2);
  const leftSteps = steps.slice(0, midPoint);
  const rightSteps = steps.slice(midPoint);

  const statusConfig = {
    success: {
      icon: '●',
      iconColor: '#44ff44',
      iconGlow: '0 0 6px rgba(68,255,68,0.7)',
      labelColor: '#909090',
      detailColor: '#44ff44',
    },
    error: {
      icon: '✕',
      iconColor: '#ff3333',
      iconGlow: '0 0 6px rgba(255,51,51,0.7)',
      labelColor: '#909090',
      detailColor: '#ff4444',
    },
    skip: {
      icon: '○',
      iconColor: '#444',
      iconGlow: 'none',
      labelColor: '#555',
      detailColor: '#555',
    },
    pending: {
      icon: '◌',
      iconColor: '#ffaa00',
      iconGlow: '0 0 5px rgba(255,170,0,0.6)',
      labelColor: '#888',
      detailColor: '#ffaa00',
    },
  };

  const renderStepColumn = (columnSteps: ProcessingStep[], startIndex: number) => (
    <div className="space-y-2.5">
      {columnSteps.map((step, index) => {
        const actualIndex = startIndex + index;
        const cfg = statusConfig[step.status];
        return (
          <div key={actualIndex} className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex-shrink-0 font-mono text-sm"
              style={{
                color: cfg.iconColor,
                textShadow: cfg.iconGlow,
                width: '14px',
                textAlign: 'center',
              }}
            >
              {cfg.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flow-step-label" style={{ color: cfg.labelColor }}>
                {String(actualIndex + 1).padStart(2, '0')}. {step.label.toUpperCase()}
              </div>
              <div
                className="flow-step-detail mt-0.5"
                style={{
                  color: cfg.detailColor,
                  textShadow:
                    step.status !== 'skip' && step.status !== 'pending' ? cfg.iconGlow : 'none',
                }}
              >
                {step.details}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="flow-panel px-6 py-5">
        <div
          className="led-display mb-4 text-xs"
          style={{ color: '#555', letterSpacing: '0.15em' }}
        >
          ▶ PROCESSING FLOW — {media.file_name}
        </div>
        <div className="grid grid-cols-2 gap-8">
          <div>{renderStepColumn(leftSteps, 0)}</div>
          <div>{renderStepColumn(rightSteps, midPoint)}</div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setShowLogViewer(true)}
            className="btn-hardware flex items-center gap-2 rounded px-3 py-1.5"
            style={{
              background: 'linear-gradient(180deg, #252525, #1a1a1a, #202020)',
              color: '#44aaff',
              borderColor: '#333',
              textShadow: '0 0 5px rgba(68,170,255,0.4)',
            }}
            title="View detailed processing logs"
          >
            <HiDocumentText className="h-3.5 w-3.5" />
            <span className="label-channel" style={{ color: '#44aaff' }}>
              VIEW LOGS [{media.logs?.length || 0}]
            </span>
          </button>
        </div>
      </div>

      {showLogViewer && (
        <LogViewer
          logs={media.logs || []}
          fileName={media.file_name}
          onClose={() => setShowLogViewer(false)}
        />
      )}
    </>
  );
}
