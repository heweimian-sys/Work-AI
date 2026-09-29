# 配置说明

`accounts.json` 中每个平台先放 20–50 个账号，确认采集质量后再扩容。

字段说明：

- `platform`：`youtube`、`xiaohongshu`、`bilibili`、`x`
- `account_id`：平台账号 ID；暂时不知道可以留空
- `url`：账号主页地址或频道地址
- `enabled`：是否启用，启用填 `true`
- `collection_mode`：`api_or_rss` 或 `browser`
