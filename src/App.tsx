import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  ExpandedState,
} from "@tanstack/react-table";
import "./App.css";
import { MOCK_ENABLED, mockMediaList, mockProcessResult } from "./mock-data";
import type { MediaInfo, ProcessResult } from "./types";
import { MainLayout } from "./components/MainLayout";
import { useMediaTableColumns } from "./hooks/useMediaTableColumns";

function App() {
  const [isDark, setIsDark] = useState(() => {
    // ローカルストレージから読み込む（デフォルトはライトモード）
    return localStorage.getItem("theme") === "dark";
  });
  const [inputDir, setInputDir] = useState<string>(MOCK_ENABLED ? "C:\\Photos" : "");
  const [outputDir, setOutputDir] = useState<string>(MOCK_ENABLED ? "C:\\Output" : "");
  const [mediaList, setMediaList] = useState<MediaInfo[]>(MOCK_ENABLED ? mockMediaList : []);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(
    MOCK_ENABLED ? mockProcessResult : null
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // 全体のデフォルト設定（静止画と動画で別）
  const [defaultPhotoDateSource, setDefaultPhotoDateSource] = useState<"Exif" | "FileName" | "FileCreated" | "FileModified">("Exif");
  const [defaultPhotoTimezoneOffset, setDefaultPhotoTimezoneOffset] = useState<string>("exif");
  const [defaultPhotoRotationMode, setDefaultPhotoRotationMode] = useState<"none" | "exif" | "90" | "180" | "270">("exif");
  const [defaultVideoDateSource, setDefaultVideoDateSource] = useState<"Exif" | "FileName" | "FileCreated" | "FileModified">("FileModified");
  const [defaultVideoTimezoneOffset, setDefaultVideoTimezoneOffset] = useState<string>("none");
  const [defaultVideoRotationMode, setDefaultVideoRotationMode] = useState<"none" | "exif" | "90" | "180" | "270">("none");

  // ユーザーの確認が必要な行（error、pending）を自動展開
  useEffect(() => {
    const newExpanded: ExpandedState = {};
    mediaList.forEach((item, index) => {
      // error: 処理失敗、pending: 処理待ち → 確認が必要
      // processing: 処理中、completed: 完了、no_change: 変更なし → 展開不要
      if (item.status === "error" || item.status === "pending") {
        newExpanded[index] = true;
      }
    });
    setExpanded(newExpanded);
  }, [mediaList]);

  // ダークモード切り替え
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  // LightBox キーボードナビゲーション
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxIndex(null);
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) => {
          if (prev === null || prev === 0) return prev;
          return prev - 1;
        });
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((prev) => {
          if (prev === null || prev === mediaList.length - 1) return prev;
          return prev + 1;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, mediaList.length]);

  // スクロール位置の監視（トップに戻るボタン表示制御）
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 300);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleDarkMode = () => {
    setIsDark(!isDark);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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

      // 初期ステータスとデフォルト設定を適用（静止画と動画で分ける）
      const mediaWithStatus = result.map((item: MediaInfo) => {
        const isPhoto = item.media_type === "Photo";
        const preferredDateSource = isPhoto ? defaultPhotoDateSource : defaultVideoDateSource;

        // デフォルトのDate Sourceが利用可能かチェック
        let finalDateSource = item.date_source;
        let finalDateTaken = item.date_taken;

        const getDateForSource = (source: string) => {
          switch (source) {
            case "Exif": return item.exif_date;
            case "FileName": return item.filename_date;
            case "FileCreated": return item.file_created_date;
            case "FileModified": return item.file_modified_date;
            default: return null;
          }
        };

        const preferredDate = getDateForSource(preferredDateSource);
        if (preferredDate) {
          finalDateSource = preferredDateSource as any;
          finalDateTaken = preferredDate;
        }

        return {
          ...item,
          date_source: finalDateSource,
          date_taken: finalDateTaken,
          progress: 0,
          status: "pending" as const,
          timezone_offset: isPhoto ? defaultPhotoTimezoneOffset : defaultVideoTimezoneOffset,
          rotation_mode: isPhoto ? defaultPhotoRotationMode : defaultVideoRotationMode,
        };
      });

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
        cleanupTemp: true,
        autoCorrectOrientation: true,
      });

      setProcessResult(result);

      // 処理結果を反映
      const updatedMedia = mediaList.map((item) => {
        const processed = result.media.find(
          (m: MediaInfo) => m.original_path === item.original_path
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

  // Use custom hook for table columns
  const columns = useMediaTableColumns({
    setLightboxIndex,
    setMediaList,
    isMockMode: MOCK_ENABLED,
  });

  const table = useReactTable({
    data: mediaList,
    columns,
    state: {
      expanded,
    },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  });

  return (
    <MainLayout
      isDark={isDark}
      onToggleDarkMode={toggleDarkMode}
      inputDir={inputDir}
      outputDir={outputDir}
      onSelectInputDir={selectInputDir}
      onSelectOutputDir={selectOutputDir}
      defaultPhotoDateSource={defaultPhotoDateSource}
      defaultPhotoTimezoneOffset={defaultPhotoTimezoneOffset}
      defaultPhotoRotationMode={defaultPhotoRotationMode}
      onPhotoDateSourceChange={setDefaultPhotoDateSource}
      onPhotoTimezoneOffsetChange={setDefaultPhotoTimezoneOffset}
      onPhotoRotationModeChange={setDefaultPhotoRotationMode}
      defaultVideoDateSource={defaultVideoDateSource}
      defaultVideoTimezoneOffset={defaultVideoTimezoneOffset}
      defaultVideoRotationMode={defaultVideoRotationMode}
      onVideoDateSourceChange={setDefaultVideoDateSource}
      onVideoTimezoneOffsetChange={setDefaultVideoTimezoneOffset}
      onVideoRotationModeChange={setDefaultVideoRotationMode}
      onScanMedia={scanMedia}
      isScanning={isScanning}
      onProcessMedia={processMedia}
      isProcessing={isProcessing}
      mediaList={mediaList}
      processResult={processResult}
      table={table}
      columns={columns}
      lightboxIndex={lightboxIndex}
      onSetLightboxIndex={setLightboxIndex}
      showScrollToTop={showScrollToTop}
      onScrollToTop={scrollToTop}
      isMockMode={MOCK_ENABLED}
    />
  );
}

export default App;
