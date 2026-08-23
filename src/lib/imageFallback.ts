// <img> のデコード失敗（HEIC/HEIF/AVIF 等、webview がデコードできない形式）を
// プレースホルダへ切り替える判定ロジック（#31 セルフレビュー M1）。
//
// 従来の実装は onError ハンドラで `e.currentTarget.style.display = 'none'` を直接 DOM 操作
// していたため、React が仮想 props に現れないスタイルを再レンダーで書き戻さず、
// LightBox で Next/Prev しても実画像が非表示のまま残るバグがあった（プレースピクセルが
// currentIndex の変化で再マウントされないため）。
//
// ここでは「失敗した src そのもの」を状態に持つ設計にする。bool の hasFailed ではなく
// failedSrc: string | null を持つことで、表示対象の src が変わればプレースホルダは
// 自動的に解除される（明示的な reset useEffect や key 指定が不要になる）。

/**
 * 表示しようとしている src が、直近でデコードに失敗した src と一致するかどうかを判定する。
 * 一致すればプレースホルダを表示し続け、異なれば（＝別ファイルへ移動した）画像を再度
 * 表示し直す。ImageWithFallback コンポーネントの描画判定を、React 抜きでテスト可能な
 * 純粋関数として切り出したもの。
 */
export function shouldShowFallback(currentSrc: string, failedSrc: string | null): boolean {
  return failedSrc !== null && failedSrc === currentSrc;
}
