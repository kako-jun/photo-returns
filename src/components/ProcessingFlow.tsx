import { useState } from "react";
import { HiCheckCircle, HiXCircle, HiMinusCircle, HiDocumentText } from "react-icons/hi2";
import type { MediaInfo } from "../types";
import { LogViewer } from "./LogViewer";

// EXIF orientationを角度に変換
function getOrientationDegrees(orientation: number | null): string | null {
  if (!orientation) return null;
  switch (orientation) {
    case 1: return "0°";
    case 3: return "180°";
    case 6: return "90°";
    case 8: return "270°";
    default: return null;
  }
}

// 処理フロー表示コンポーネント
export function ProcessingFlow({ media }: { media: MediaInfo }) {
  const [showLogViewer, setShowLogViewer] = useState(false);
  const isError = media.status === "error";
  const isCompleted = media.status === "completed";
  const isProcessing = media.status === "processing";

  type StepStatus = "success" | "error" | "skip" | "pending";

  interface ProcessingStep {
    label: string;
    status: StepStatus;
    details: string;
  }

  const steps: ProcessingStep[] = [];

  // ① Input File
  steps.push({
    label: "Input File",
    status: "success",
    details: `${media.file_name} (${(media.file_size / (1024 * 1024)).toFixed(2)} MB)`,
  });

  // ② Date Source
  if (media.date_taken) {
    steps.push({
      label: "Date Source",
      status: "success",
      details: `${media.date_source} → ${new Date(media.date_taken).toLocaleString()}`,
    });
  } else {
    steps.push({
      label: "Date Source",
      status: "error",
      details: "No date found",
    });
  }

  // ③ Burst Detection
  if (media.burst_group_id !== null) {
    steps.push({
      label: "Burst Detection",
      status: "success",
      details: `Group ${media.burst_group_id}, Index ${media.burst_index}`,
    });
  } else {
    steps.push({
      label: "Burst Detection",
      status: "skip",
      details: "Not in burst group",
    });
  }

  // ④ TZ Correction
  if (media.timezone_offset && media.timezone_offset !== "none") {
    steps.push({
      label: "TZ Correction",
      status: "success",
      details: `Applied ${media.timezone_offset === "exif" ? "EXIF" : media.timezone_offset}`,
    });
  } else {
    steps.push({
      label: "TZ Correction",
      status: "skip",
      details: "Not applied",
    });
  }

  // ⑤ File Naming
  if (media.new_name) {
    steps.push({
      label: "File Naming",
      status: "success",
      details: media.new_name,
    });
  } else {
    steps.push({
      label: "File Naming",
      status: "error",
      details: "Name generation failed",
    });
  }

  // ⑥ Rotation
  const rotationMode = media.rotation_mode ?? (media.exif_orientation && media.exif_orientation !== 1 ? "exif" : "none");
  if (rotationMode !== "none") {
    const degrees = rotationMode === "exif" ? getOrientationDegrees(media.exif_orientation) : rotationMode;
    steps.push({
      label: "Rotation",
      status: media.rotation_applied ? "success" : "pending",
      details: `Rotate ${degrees}`,
    });
  } else {
    steps.push({
      label: "Rotation",
      status: "skip",
      details: "No rotation needed",
    });
  }

  // ⑦ Directory Creation
  if (media.new_path) {
    const pathParts = media.new_path.split(/[\\/]/);
    const year = pathParts[pathParts.length - 4];
    const month = pathParts[pathParts.length - 3];
    const day = pathParts[pathParts.length - 2];
    steps.push({
      label: "Directory Creation",
      status: "success",
      details: `${year} / ${month} / ${day}`,
    });
  } else {
    steps.push({
      label: "Directory Creation",
      status: "pending",
      details: "Pending",
    });
  }

  // ⑧ File Processing
  if (isCompleted) {
    steps.push({
      label: "File Processing",
      status: "success",
      details: "File copied successfully",
    });
  } else if (isProcessing) {
    steps.push({
      label: "File Processing",
      status: "pending",
      details: "Processing...",
    });
  } else if (isError) {
    steps.push({
      label: "File Processing",
      status: "error",
      details: media.error_message || "Unknown error",
    });
  } else {
    steps.push({
      label: "File Processing",
      status: "pending",
      details: "Waiting to start",
    });
  }

  // ⑨ Complete/Error
  if (isCompleted) {
    steps.push({
      label: "Complete",
      status: "success",
      details: "✓ Successfully processed",
    });
  } else if (isError) {
    steps.push({
      label: "Error",
      status: "error",
      details: media.error_message || "Processing failed",
    });
  } else {
    steps.push({
      label: "Status",
      status: "pending",
      details: media.status || "pending",
    });
  }

  // 2列レイアウト用に分割
  const midPoint = Math.ceil(steps.length / 2);
  const leftSteps = steps.slice(0, midPoint);
  const rightSteps = steps.slice(midPoint);

  const renderStepColumn = (columnSteps: ProcessingStep[], startIndex: number) => {
    return (
      <div className="space-y-3">
        {columnSteps.map((step, index) => {
          const actualIndex = startIndex + index;
          const statusIcons = {
            success: <HiCheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />,
            error: <HiXCircle className="w-5 h-5 text-red-600 dark:text-red-400" />,
            skip: <HiMinusCircle className="w-5 h-5 text-gray-400 dark:text-gray-500" />,
            pending: <div className="w-5 h-5 rounded-full border-2 border-orange-500 dark:border-orange-400"></div>,
          };
          const statusColors = {
            success: "text-green-700 dark:text-green-300",
            error: "text-red-700 dark:text-red-300",
            skip: "text-gray-500 dark:text-gray-400",
            pending: "text-orange-700 dark:text-orange-300",
          };
          return (
            <div key={actualIndex} className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">{statusIcons[step.status]}</div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {actualIndex + 1}. {step.label}
                </h4>
                <p className={`text-xs mt-1 ${statusColors[step.status]}`}>
                  {step.details}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="p-6 border-t-2 border-blue-500 dark:border-blue-400">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Processing Flow</h3>
          <button
            onClick={() => setShowLogViewer(true)}
            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-semibold shadow-sm hover:shadow-md"
            title="View detailed processing logs"
          >
            <HiDocumentText className="w-4 h-4" />
            View Logs ({media.logs?.length || 0})
          </button>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>{renderStepColumn(leftSteps, 0)}</div>
          <div>{renderStepColumn(rightSteps, midPoint)}</div>
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
