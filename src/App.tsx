import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import "./App.css";

// Rust側のMediaInfo型に対応
interface MediaInfo {
  original_path: string;
  file_name: string;
  media_type: "Photo" | "Video";
  date_taken: string | null;
  new_name: string;
  new_path: string;
  file_size: number;
  progress?: number; // 進捗（0-100）
  status?: "pending" | "processing" | "completed" | "error";
  error_message?: string;
}

interface ProcessResult {
  success: boolean;
  total_files: number;
  processed_files: number;
  media: MediaInfo[];
  errors: string[];
}

const columnHelper = createColumnHelper<MediaInfo>();

function App() {
  const [inputDir, setInputDir] = useState<string>("");
  const [outputDir, setOutputDir] = useState<string>("");
  const [mediaList, setMediaList] = useState<MediaInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);

  // フォルダ選択
  const selectInputDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Input Directory",
    });
    if (selected) {
      setInputDir(selected as string);
    }
  };

  const selectOutputDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Output Directory",
    });
    if (selected) {
      setOutputDir(selected as string);
    }
  };

  // スキャン
  const scanMedia = async () => {
    if (!inputDir) {
      alert("Please select input directory");
      return;
    }

    setIsScanning(true);
    try {
      const result = await invoke<MediaInfo[]>("scan_media", {
        inputDir,
        includeVideos: true,
        parallel: true,
      });

      // 初期ステータスを設定
      const mediaWithStatus = result.map((item) => ({
        ...item,
        progress: 0,
        status: "pending" as const,
      }));

      setMediaList(mediaWithStatus);
    } catch (error) {
      console.error("Scan error:", error);
      alert(`Scan error: ${error}`);
    } finally {
      setIsScanning(false);
    }
  };

  // 処理実行
  const processMedia = async () => {
    if (!inputDir || !outputDir) {
      alert("Please select both input and output directories");
      return;
    }

    if (mediaList.length === 0) {
      alert("No media files to process. Please scan first.");
      return;
    }

    setIsProcessing(true);
    setProcessResult(null);

    try {
      const result = await invoke<ProcessResult>("process_media", {
        inputDir,
        outputDir,
        backupDir: null,
        includeVideos: true,
        parallel: true,
        timezoneOffset: null,
        cleanupTemp: false,
        autoCorrectOrientation: false,
      });

      setProcessResult(result);

      // 処理結果を反映
      const updatedMedia = mediaList.map((item) => {
        const processed = result.media.find(
          (m) => m.original_path === item.original_path
        );
        return {
          ...item,
          progress: 100,
          status: processed?.new_path ? ("completed" as const) : ("error" as const),
          new_path: processed?.new_path || "",
        };
      });

      setMediaList(updatedMedia);
    } catch (error) {
      console.error("Process error:", error);
      alert(`Process error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // テーブルのカラム定義
  const columns = [
    columnHelper.accessor("media_type", {
      header: "Type",
      cell: (info) => (
        <span className={`badge ${info.getValue() === "Photo" ? "photo" : "video"}`}>
          {info.getValue()}
        </span>
      ),
      size: 80,
    }),
    columnHelper.accessor("file_name", {
      header: "Original Name",
      cell: (info) => <span title={info.row.original.original_path}>{info.getValue()}</span>,
      size: 250,
    }),
    columnHelper.accessor("new_name", {
      header: "New Name",
      cell: (info) => <span className="new-name">{info.getValue()}</span>,
      size: 200,
    }),
    columnHelper.accessor("date_taken", {
      header: "Date Taken",
      cell: (info) => {
        const date = info.getValue();
        return date ? new Date(date).toLocaleString() : "N/A";
      },
      size: 180,
    }),
    columnHelper.accessor("file_size", {
      header: "Size",
      cell: (info) => {
        const size = info.getValue();
        return size > 1024 * 1024
          ? `${(size / (1024 * 1024)).toFixed(1)} MB`
          : `${(size / 1024).toFixed(1)} KB`;
      },
      size: 100,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue() || "pending";
        return <span className={`status ${status}`}>{status}</span>;
      },
      size: 100,
    }),
    columnHelper.display({
      id: "progress",
      header: "Progress",
      cell: (info) => {
        const progress = info.row.original.progress || 0;
        const status = info.row.original.status || "pending";
        return (
          <div className="progress-container">
            <div
              className={`progress-bar ${status}`}
              style={{ width: `${progress}%` }}
            ></div>
            <span className="progress-text">{progress}%</span>
          </div>
        );
      },
      size: 120,
    }),
  ];

  const table = useReactTable({
    data: mediaList,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="app">
      <header>
        <h1>PhotoReturns</h1>
        <p className="subtitle">Take back your memories</p>
      </header>

      <section className="controls">
        <div className="folder-selection">
          <div className="folder-input">
            <label>Input Directory:</label>
            <input type="text" value={inputDir} readOnly placeholder="Select folder..." />
            <button onClick={selectInputDir}>Browse</button>
          </div>
          <div className="folder-input">
            <label>Output Directory:</label>
            <input type="text" value={outputDir} readOnly placeholder="Select folder..." />
            <button onClick={selectOutputDir}>Browse</button>
          </div>
        </div>

        <div className="actions">
          <button
            onClick={scanMedia}
            disabled={!inputDir || isScanning}
            className="btn-primary"
          >
            {isScanning ? "Scanning..." : "Scan Media Files"}
          </button>
          <button
            onClick={processMedia}
            disabled={!inputDir || !outputDir || mediaList.length === 0 || isProcessing}
            className="btn-success"
          >
            {isProcessing ? "Processing..." : "Process & Rename"}
          </button>
        </div>
      </section>

      {processResult && (
        <section className="summary">
          <h3>Process Summary</h3>
          <p>
            Total: {processResult.total_files} | Processed: {processResult.processed_files} |{" "}
            Success: {processResult.success ? "✓" : "✗"}
          </p>
          {processResult.errors.length > 0 && (
            <details>
              <summary>Errors ({processResult.errors.length})</summary>
              <ul>
                {processResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section className="media-list">
        <h3>Media Files ({mediaList.length})</h3>
        {mediaList.length === 0 ? (
          <p className="empty-message">No media files scanned yet. Select a folder and click "Scan Media Files".</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} style={{ width: header.getSize() }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
