// 出力ファイル名（stem+拡張子）のプレビューを計算する純粋関数（#29）。
//
// なぜクライアント側で再計算するか:
// New Name 列は「まだ処理していない行」にもプレビューを出す。ユーザーは行ごとに
// date_source / timezone_offset を切り替えて結果を確認したいが、その都度バックエンドへ
// 再スキャンをかけるのは重い。そのため、scan 済みの MediaInfo（date_taken / subsec_time /
// burst_index / resolved_provenance_tag）だけから、バックエンドと同じ組み立て規則で
// クライアント側に stem を再構築させている。
//
// 組み立て順（backend の正本 `build_stem`、src-tauri/src/photo_core/dating.rs と対応）:
//   YYYY-MM-DD_HH-MM-SS[-mmm][_バーストNN][_タグ]
// 日時 → バースト連番 → タグ、の順で backend と一致させること。この対応が崩れると
// プレビューと実際の出力ファイル名が食い違う（#29 レビュー M1）。
//
// 含めないもの:
// - 衝突連番（末尾に付く再生成分）。衝突は「同じ stem を持つ他ファイルが同一出力先に
//   存在するか」という処理時点の状態に依存し、scan 直後のクライアント側では本質的に
//   知り得ない（知るには全ファイルの最終 stem を確定させる必要があり、それはまさに
//   バックエンドの処理そのもの）。プレビューはあくまで「衝突が起きなかった場合の名前」
//   までを保証する。

import type { MediaInfo } from '../types';

/**
 * 1件分の MediaInfo から出力ファイル名（拡張子込み）のプレビューを計算する。
 * date_taken が無い場合は日付を組み立てられないため 'unknown_date' を返す
 * （backend の `fallback_stem`—通常は元ファイルのステム—は scan 結果に含まれておらず
 * クライアント側では再現できないための簡略化。既存挙動を維持）。
 */
export function calculateNewName(media: MediaInfo): string {
  const dateTaken = media.date_taken;
  if (!dateTaken) return 'unknown_date';

  let d = new Date(dateTaken);
  const selectedOffset = media.timezone_offset ?? 'none';
  const exifTimezone = media.timezone;
  let offsetToUse = selectedOffset;
  if (selectedOffset === 'exif' && exifTimezone) offsetToUse = exifTimezone;
  if (offsetToUse !== 'none' && offsetToUse !== 'exif') {
    const match = offsetToUse.match(/([+-])(\d{2}):(\d{2})/);
    if (match) {
      const sign = match[1] === '+' ? 1 : -1;
      const hours = parseInt(match[2], 10);
      const minutes = parseInt(match[3], 10);
      d = new Date(d.getTime() + sign * (hours * 60 + minutes) * 60 * 1000);
    }
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');
  const extension = media.file_name.split('.').pop() || 'jpg';

  let stem =
    media.subsec_time !== null && media.subsec_time !== undefined
      ? `${year}-${month}-${day}_${hour}-${minute}-${second}-${String(media.subsec_time).padStart(3, '0')}`
      : `${year}-${month}-${day}_${hour}-${minute}-${second}`;

  // バースト連番（backend: `build_stem` の `_${idx:02}`）
  if (media.burst_index !== null && media.burst_index !== undefined) {
    stem += `_${String(media.burst_index).padStart(2, '0')}`;
  }

  // 由来タグ（backend: `build_stem` の `_${tag}`。バースト連番の後）
  if (media.resolved_provenance_tag) {
    stem += `_${media.resolved_provenance_tag}`;
  }

  return `${stem}.${extension}`;
}
