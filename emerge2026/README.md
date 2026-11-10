# 浮現祭 EMERGE FEST 2026 時間表

依使用者提供的 DAY 1（2/28）及 DAY 2（3/1）圖片轉錄。收錄 86 個已列時段：DAY 1 共 44 筆（含 10:40 早操）、DAY 2 共 42 筆。保留七個區域，DAZN 瘋區未在圖上列出時段，因此保持空欄。

入口：`index.html`。使用說明：`help.html`。資料範圍：`sources.html`。

此目錄使用上層共用的 `app.js`、`core.js` 與 `style.css`；活動設定在 `data/festival.js`，使用標準 Schema，不需要另寫引擎。`data/schedule.json` 是供人工校對的精簡轉錄；實際執行只載入 `data/festival.js`，不會 fetch JSON。更新時應同步兩份資料，測試會檢查其一致性。

直接在現有 GitHub Pages 的 `/emerge2026/` 路徑使用，無須安裝 Python、Node.js 或後端。若要獨立部署到其他儲存庫，請將上層三個共用檔案一併帶入，並調整三個相對路徑。

- 活動識別：`emerge2026`，本機紀錄與浪人祭分開。
- 不接受其他活動或未標記活動的舊版分享。
- 沒有預選圖片中被螢光筆標記的場次。
- 沒有新增虛構樂團介紹、未提供的 DAZN 活動或簽名會。
- 官方活動資料：https://emergelivehouse2.kktix.cc/events/jrw6e7s

目前版本是圖片轉錄紀錄，不保證符合後續公告的最終版本；實際內容以主辦單位公告為準。
