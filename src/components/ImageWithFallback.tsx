import { useState, type CSSProperties, type ReactNode } from 'react';
import { shouldShowFallback } from '../lib/imageFallback';

interface ImageWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
  /** webview がデコードできない時に <img> の代わりに表示するプレースホルダ。 */
  fallback: ReactNode;
}

/**
 * webview がデコードできない形式（HEIC/HEIF/AVIF 等）の `<img>` を、レイアウトを崩さず
 * プレースホルダへ差し替える共通コンポーネント（Before/After サムネイル・LightBox・
 * OrientationConfirm の4箇所で共通利用、#31 セルフレビュー M1/S4/S5）。
 *
 * 直接 DOM 操作（`e.currentTarget.style.display = 'none'`）はせず、React state 駆動の
 * 条件付きレンダリングにする。`shouldShowFallback` が「失敗した src」を状態に持つため、
 * `src` が変われば（＝別ファイルへナビゲーションした）プレースホルダは自動的に解除される。
 * `key` 指定や reset 用の `useEffect` は不要。
 */
export function ImageWithFallback({
  src,
  alt,
  className,
  style,
  loading,
  fallback,
}: ImageWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (shouldShowFallback(src, failedSrc)) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      onError={() => setFailedSrc(src)}
    />
  );
}
