/// 連続撮影写真（バースト）のグループ化機能
use chrono::{DateTime, Duration, Local};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// バーストグループID
pub type BurstGroupId = usize;

/// バースト写真の情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurstGroup {
    /// グループID
    pub id: BurstGroupId,
    /// グループ内の写真のインデックス（元のリスト内）
    pub photo_indices: Vec<usize>,
    /// グループの開始時刻
    pub start_time: DateTime<Local>,
    /// グループの終了時刻
    pub end_time: DateTime<Local>,
    /// グループ内の写真枚数
    pub count: usize,
}

/// バースト検出の設定
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurstDetectorConfig {
    /// バーストとみなす最大時間間隔（秒）
    pub max_interval_seconds: i64,
    /// バーストとみなす最小枚数
    pub min_count: usize,
}

impl Default for BurstDetectorConfig {
    fn default() -> Self {
        Self {
            max_interval_seconds: 3, // 3秒以内
            min_count: 3,             // 3枚以上
        }
    }
}

/// 写真の撮影時刻に基づいてバーストグループを検出
///
/// # Arguments
/// * `dates` - 各写真の撮影日時のリスト
/// * `config` - バースト検出の設定
///
/// # Returns
/// 検出されたバーストグループのリスト
pub fn detect_burst_groups(
    dates: &[Option<DateTime<Local>>],
    config: &BurstDetectorConfig,
) -> Vec<BurstGroup> {
    let mut groups = Vec::new();
    let mut current_group: Option<Vec<usize>> = None;
    let mut last_time: Option<DateTime<Local>> = None;

    for (i, date_opt) in dates.iter().enumerate() {
        if let Some(date) = date_opt {
            match (current_group.as_mut(), last_time) {
                (Some(group), Some(last)) => {
                    // 前の写真との時間差を計算
                    let diff = *date - last;

                    if diff <= Duration::seconds(config.max_interval_seconds)
                        && diff >= Duration::seconds(0)
                    {
                        // 同じグループに追加
                        group.push(i);
                        last_time = Some(*date);
                    } else {
                        // 現在のグループを確定
                        if group.len() >= config.min_count {
                            let start_time = dates[group[0]].unwrap();
                            let end_time = dates[*group.last().unwrap()].unwrap();

                            groups.push(BurstGroup {
                                id: groups.len(),
                                photo_indices: group.clone(),
                                start_time,
                                end_time,
                                count: group.len(),
                            });
                        }

                        // 新しいグループを開始
                        current_group = Some(vec![i]);
                        last_time = Some(*date);
                    }
                }
                _ => {
                    // 最初の写真、または最初の有効な日時
                    current_group = Some(vec![i]);
                    last_time = Some(*date);
                }
            }
        }
    }

    // 最後のグループを確定
    if let Some(group) = current_group {
        if group.len() >= config.min_count {
            let start_time = dates[group[0]].unwrap();
            let end_time = dates[*group.last().unwrap()].unwrap();
            let count = group.len();

            groups.push(BurstGroup {
                id: groups.len(),
                photo_indices: group,
                start_time,
                end_time,
                count,
            });
        }
    }

    groups
}

/// 各写真がどのバーストグループに属するかのマップを作成
///
/// # Arguments
/// * `groups` - バーストグループのリスト
///
/// # Returns
/// 写真インデックス → グループIDのマップ
pub fn create_photo_to_group_map(groups: &[BurstGroup]) -> HashMap<usize, BurstGroupId> {
    let mut map = HashMap::new();

    for group in groups {
        for &photo_idx in &group.photo_indices {
            map.insert(photo_idx, group.id);
        }
    }

    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_detect_burst_groups() {
        let base_time = Utc::now().with_timezone(&Local);

        let dates = vec![
            Some(base_time),                                      // 0
            Some(base_time + Duration::seconds(1)),               // 1 - グループ1
            Some(base_time + Duration::seconds(2)),               // 2 - グループ1
            Some(base_time + Duration::seconds(3)),               // 3 - グループ1
            Some(base_time + Duration::seconds(10)),              // 4 - 間隔が空く
            Some(base_time + Duration::seconds(11)),              // 5
            Some(base_time + Duration::seconds(12)),              // 6 - グループ2
            Some(base_time + Duration::seconds(13)),              // 7 - グループ2
        ];

        let config = BurstDetectorConfig::default();
        let groups = detect_burst_groups(&dates, &config);

        assert_eq!(groups.len(), 2); // 2つのグループ検出
        assert_eq!(groups[0].count, 4); // 1つ目は4枚
        assert_eq!(groups[1].count, 3); // 2つ目は3枚
    }

    #[test]
    fn test_create_photo_to_group_map() {
        let base_time = Utc::now().with_timezone(&Local);

        let groups = vec![
            BurstGroup {
                id: 0,
                photo_indices: vec![0, 1, 2],
                start_time: base_time,
                end_time: base_time + Duration::seconds(2),
                count: 3,
            },
            BurstGroup {
                id: 1,
                photo_indices: vec![5, 6, 7],
                start_time: base_time + Duration::seconds(10),
                end_time: base_time + Duration::seconds(12),
                count: 3,
            },
        ];

        let map = create_photo_to_group_map(&groups);

        assert_eq!(map.len(), 6);
        assert_eq!(map.get(&0), Some(&0));
        assert_eq!(map.get(&1), Some(&0));
        assert_eq!(map.get(&5), Some(&1));
        assert_eq!(map.get(&6), Some(&1));
    }

    #[test]
    fn test_min_count_filter() {
        let base_time = Utc::now().with_timezone(&Local);

        let dates = vec![
            Some(base_time),
            Some(base_time + Duration::seconds(1)), // 2枚だけ → グループ化されない
            Some(base_time + Duration::seconds(10)),
        ];

        let config = BurstDetectorConfig::default();
        let groups = detect_burst_groups(&dates, &config);

        assert_eq!(groups.len(), 0); // min_count=3なのでグループなし
    }
}
