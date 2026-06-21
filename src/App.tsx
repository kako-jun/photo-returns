import { useState, useEffect } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  ExpandedState,
} from '@tanstack/react-table';
import './App.css';
import { MOCK_ENABLED, mockMediaList, mockProcessResult } from './mock-data';
import type { MediaInfo, ProcessResult, ProgressEvent } from './types';
import {
  mergeProcessResults,
  selectRetryTargets,
  applyProgressEvent,
  markTargetsProcessing,
} from './lib/processResults';
import { MainLayout } from './components/MainLayout';
import { useMediaTableColumns } from './hooks/useMediaTableColumns';
import { getStorageValue, saveStorage } from './storage';

function App() {
  const [isDark, setIsDark] = useState(() => {
    // ローカルストレージから読み込む（デフォルトはライトモード）
    return getStorageValue('theme') === 'dark';
  });
  const [inputDir, setInputDir] = useState<string>(() => {
    if (MOCK_ENABLED) return 'C:\\Photos';
    return getStorageValue('inputDir') || '';
  });
  const [outputDir, setOutputDir] = useState<string>(() => {
    if (MOCK_ENABLED) return 'C:\\Output';
    return getStorageValue('outputDir') || '';
  });
  const [mediaList, setMediaList] = useState<MediaInfo[]>(MOCK_ENABLED ? mockMediaList : []);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // 全体進捗（#4）: 処理中ファイル数 done/total と派生パーセント。処理開始でリセット、
  // Channel 受信ごとに更新する。
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [processResult, setProcessResult] = useState<ProcessResult | null>(
    MOCK_ENABLED ? mockProcessResult : null
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // 全体のデフォルト設定（静止画と動画で別）
  const [defaultPhotoDateSource, setDefaultPhotoDateSource] = useState<
    'Exif' | 'FileName' | 'FileCreated' | 'FileModified'
  >('Exif');
  const [defaultPhotoTimezoneOffset, setDefaultPhotoTimezoneOffset] = useState<string>('exif');
  const [defaultPhotoRotationMode, setDefaultPhotoRotationMode] = useState<
    'none' | 'exif' | '90' | '180' | '270'
  >('exif');
  const [defaultVideoDateSource, setDefaultVideoDateSource] = useState<
    'Exif' | 'FileName' | 'FileCreated' | 'FileModified'
  >('FileModified');
  const [defaultVideoTimezoneOffset, setDefaultVideoTimezoneOffset] = useState<string>('none');
  const [defaultVideoRotationMode, setDefaultVideoRotationMode] = useState<
    'none' | 'exif' | '90' | '180' | '270'
  >('none');

  // ユーザーの確認が必要な行（error）を自動展開
  useEffect(() => {
    const newExpanded: ExpandedState = {};
    mediaList.forEach((item, index) => {
      // error: 処理失敗 → 確認が必要
      // pending: 処理待ち、processing: 処理中、completed: 完了、no_change: 変更なし → 展開不要
      if (item.status === 'error') {
        newExpanded[index] = true;
      }
    });
    setExpanded(newExpanded);
  }, [mediaList]);

  // ダークモード切り替え
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      saveStorage({ theme: 'dark' });
    } else {
      document.documentElement.classList.remove('dark');
      saveStorage({ theme: 'light' });
    }
  }, [isDark]);

  // LightBox キーボードナビゲーション
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setLightboxIndex((prev) => {
          if (prev === null || prev === 0) return prev;
          return prev - 1;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setLightboxIndex((prev) => {
          if (prev === null || prev === mediaList.length - 1) return prev;
          return prev + 1;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, mediaList.length]);

  // スクロール位置の監視（トップに戻るボタン表示制御）
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleDarkMode = () => {
    setIsDark(!isDark);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // フォルダ選択
  const selectInputDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Input Directory',
    });
    if (selected) {
      const path = selected as string;
      setInputDir(path);
      saveStorage({ inputDir: path });
    }
  };

  const selectOutputDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Output Directory',
    });
    if (selected) {
      const path = selected as string;
      setOutputDir(path);
      saveStorage({ outputDir: path });
    }
  };

  // スキャン
  const scanMedia = async () => {
    if (!inputDir) {
      alert('Please select input directory');
      return;
    }

    setIsScanning(true);
    try {
      const result = await invoke<MediaInfo[]>('scan_media', {
        inputDir,
        includeVideos: true,
        parallel: true,
      });

      // 初期ステータスとデフォルト設定を適用（静止画と動画で分ける）
      const mediaWithStatus = result.map((item: MediaInfo) => {
        const isPhoto = item.media_type === 'Photo';
        const preferredDateSource = isPhoto ? defaultPhotoDateSource : defaultVideoDateSource;

        // デフォルトのDate Sourceが利用可能かチェック
        let finalDateSource = item.date_source;
        let finalDateTaken = item.date_taken;

        const getDateForSource = (source: string) => {
          switch (source) {
            case 'Exif':
            case 'QuickTime':
              return item.exif_date;
            case 'FileName':
              return item.filename_date;
            case 'FileCreated':
              return item.file_created_date;
            case 'FileModified':
              return item.file_modified_date;
            default:
              return null;
          }
        };

        const preferredDate = getDateForSource(preferredDateSource);
        if (preferredDate) {
          finalDateSource = preferredDateSource as MediaInfo['date_source'];
          finalDateTaken = preferredDate;
        }

        return {
          ...item,
          date_source: finalDateSource,
          date_taken: finalDateTaken,
          progress: 0,
          status: 'pending' as const,
          timezone_offset: isPhoto ? defaultPhotoTimezoneOffset : defaultVideoTimezoneOffset,
          rotation_mode: isPhoto ? defaultPhotoRotationMode : defaultVideoRotationMode,
        };
      });

      setMediaList(mediaWithStatus);
    } catch (error) {
      console.error('Scan error:', error);
      alert(`Scan error: ${error}`);
    } finally {
      setIsScanning(false);
    }
  };

  // 処理実行
  // itemsToProcess を渡すとそのサブセットのみ処理する（リトライ時に失敗ファイルだけを対象にする）。
  // 省略時は全件処理（初回実行）。
  const processMedia = async (itemsToProcess?: MediaInfo[]) => {
    if (!inputDir || !outputDir) {
      alert('Please select both input and output directories');
      return;
    }

    if (mediaList.length === 0) {
      alert('No media files to process. Please scan first.');
      return;
    }

    const targets = itemsToProcess ?? mediaList;
    if (targets.length === 0) {
      return;
    }

    // Directory validation
    // Windows はケース非依存、Linux/macOS はケース依存のため、
    // Windows のみ小文字化してスラッシュ統一、他はスラッシュ統一のみ行う。
    const isWindows = inputDir.includes('\\') || /^[A-Za-z]:/.test(inputDir);
    const normalizePath = (p: string) => {
      const withForwardSlash = p.replace(/\\/g, '/').replace(/\/+$/, '');
      return isWindows ? withForwardSlash.toLowerCase() : withForwardSlash;
    };
    const normalizedInput = normalizePath(inputDir);
    const normalizedOutput = normalizePath(outputDir);

    // Check if output is inside input (dangerous)
    if (normalizedOutput.startsWith(normalizedInput + '/')) {
      alert(
        '❌ Error: Output directory is inside input directory.\n\n' +
          'This could cause infinite loops.\n' +
          'Please select a different output location.'
      );
      return;
    }

    // Check if input equals output (overwrite mode)
    if (normalizedInput === normalizedOutput) {
      const proceed = window.confirm(
        '⚠️ Warning: Input and output directories are the same.\n\n' +
          'This will OVERWRITE existing files.\n' +
          'Backup is strongly recommended.\n\n' +
          'Do you want to continue?'
      );
      if (!proceed) {
        return;
      }
    }

    setIsProcessing(true);
    setProcessResult(null);
    // 全体進捗をリセット（total = 今回処理する件数。リトライ時は失敗ファイル数）。
    setProgress({ done: 0, total: targets.length });
    // 対象行を「処理中」に。対象外（完了済みなど）は据え置く。
    setMediaList((prev) => markTargetsProcessing(prev, targets));

    // ファイル1件完了ごとにバックエンドから届く進捗イベントを受ける Channel（#4）。
    // onmessage 内では setMediaList の関数更新形を使い、stale closure（古い mediaList の
    // キャプチャ）を避ける。invoke 解決後は finally で listener を解除する。
    const onProgress = new Channel<ProgressEvent>();
    onProgress.onmessage = (event) => {
      // 該当行のステータス／進捗をライブ更新（new_path/logs は完了後の最終マージで確定）。
      setMediaList((prev) => applyProgressEvent(prev, event));
      // 全体進捗はイベントの done を採用（並列でも単調増加・1..=total を網羅）。
      setProgress((prev) =>
        event.done > prev.done ? { done: event.done, total: event.total } : prev
      );
    };

    try {
      // backend は渡した media_list だけを処理し、各項目の status は見ない。
      // よってリトライ時は失敗ファイルのみを targets に入れれば、完了済みは再処理されない。
      const result = await invoke<ProcessResult>('process_media_with_settings', {
        mediaList: targets,
        outputDir,
        backupDir: null,
        parallel: true,
        includeVideos: true,
        cleanupTemp: true,
        onProgress,
      });

      setProcessResult(result);

      // 処理結果を反映。今回処理した targets のみ更新し、対象外（完了済みなど）は
      // 据え置く（リトライで完了済みを再処理・誤 error 化しない）。new_path/logs を確定値で
      // 上書きし、ライブ進捗の暫定 status を最終結果へ揃える。
      setMediaList((prev) => mergeProcessResults(prev, targets, result.media));
    } catch (error) {
      console.error('Process error:', error);
      alert(`Process error: ${error}`);
      // invoke 自体が失敗した場合（IPC エラー等）、processing のまま固まった対象行を
      // error に落として復帰可能にする（Retry Failed の対象に乗る）。
      setMediaList((prev) =>
        prev.map((item) =>
          item.status === 'processing' ? { ...item, status: 'error' as const, progress: 0 } : item
        )
      );
    } finally {
      // listener を解除して以後の送信を無視する。
      onProgress.onmessage = () => {};
      setIsProcessing(false);
    }
  };

  // エラーファイルのみ再処理
  const retryFailedFiles = async () => {
    const errorFiles = selectRetryTargets(mediaList);

    if (errorFiles.length === 0) {
      alert('No failed files to retry');
      return;
    }

    const proceed = window.confirm(
      `Retry processing ${errorFiles.length} failed files?\n\n` +
        'This will attempt to process only the files that failed previously.'
    );

    if (!proceed) {
      return;
    }

    // エラーファイルのステータスをpendingにリセット
    setMediaList((prev) =>
      prev.map((item) =>
        item.status === 'error' ? { ...item, status: 'pending' as const, progress: 0 } : item
      )
    );

    // 失敗ファイルのみを再処理（完了済みは対象外）
    await processMedia(errorFiles);
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
      onRetryFailed={retryFailedFiles}
      isProcessing={isProcessing}
      progressDone={progress.done}
      progressTotal={progress.total}
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
