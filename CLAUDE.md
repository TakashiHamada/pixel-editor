# CLAUDE.md - AI開発ガイド

## コミット時のルール

毎回コミット前に `index.html` 内の `#build-info` 要素のタイムスタンプを日本時間(JST)で更新すること。

```html
<div id="build-info">Last commit: YYYY-MM-DD HH:MM JST</div>
```

タイムスタンプの取得方法:
```bash
TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M JST'
```
