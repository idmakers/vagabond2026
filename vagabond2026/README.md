# 浪人祭 2026 時間表

活動入口：`index.html`。操作與隱私說明：`help.html`。活動資料：`data/festival.js`。

此資料夾與 `emerge2026/` 並列，共用上層的 `app.js`、`core.js` 與 `style.css`。保留原有 74 場演出、場次 ID、活動識別 `vagabond2026` 及本機儲存鍵 `timetable_picks_vagabond2026`。

同網域下僅更改路徑不會改變 LocalStorage 來源，因此既有本機紀錄可繼續使用。舊鍵 `vagabond2026_schedule_v1` 的非破壞性遷移規則亦保留。

網站根目錄現在是活動選擇入口。舊首頁的 `#share=`／`#cloud=` 陣列分享會導向本資料夾；新版分享會依活動識別導向對應活動，再由活動頁驗證資料與確認是否取代。舊 `help.html#privacy` 導向這裡的使用說明並保留錨點。

以上相容導向適用於同一個可存取網域／專案路徑；更換網域仍需正確設定 DNS 與 GitHub Pages，瀏覽器紀錄不會跨網域自動搬移。
