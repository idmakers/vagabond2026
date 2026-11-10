# Event Timetable Template Engine

可重複使用的多舞台音樂祭跑場時間表。活動資料集中於 `data/festival.js`，畫面、時間計算、成員紀錄與匯出由通用引擎處理。目前附帶的正式資料為「2026 浪人祭」，保留原有 74 場演出及場次 ID。

純前端、免登入、零後端資料庫，直接部署到 GitHub Pages 或其他靜態主機即可使用。**使用網站及部署不需要 Python、Node.js、npm 或建置步驟。**

## 功能

已建立的活動實例：

- 浪人祭 2026：網站根目錄。
- 浮現祭 EMERGE FEST 2026：[開啟互動時間表](https://vagabond.justwe.uk/emerge2026/)，資料依提供的兩張圖片轉錄，包含 86 個時段。來源及範圍見 `emerge2026/sources.html`；共用同一套通用引擎，活動紀錄分開保存。

- 設定任意活動日期與舞台，動態建立分頁、舞台欄位及每天的時間刻度。
- 時間軸選團、樂團／曲風搜尋、縮放、突顯已選與團友熱門標記。
- 多位成員的頭像、顏色與選團對照；個人跑台順序、空檔與衝堂分析。
- 每場獨立的介紹與 AI 生成標記，並提供官方網站、YouTube 與 Spotify 搜尋入口。
- 全團網址快照分享；個人文字清單、CSV 與 ICS 行事曆匯出。
- 依活動命名空間儲存本機紀錄，不同活動互不覆蓋。
- 支援跨午夜演出，依 IANA 時區換算行事曆時間。

## 如何替換為新音樂祭：三步驟

### 1. 填寫 JSON，放入活動設定

複製 `festival-config.sample.json`，填寫 `meta`、`days`、`stages` 與 `events`。完成後，將整個 JSON 物件放入 `data/festival.js`：

```js
window.FESTIVAL_CONFIG = {
  // 這裡貼上你填好的 JSON 物件內容
};
```

也就是在 JSON 物件前加上 `window.FESTIVAL_CONFIG = `，最後加上 `;`。修改已部署站點時，真正載入的是 **data/festival.js**，不是 sample JSON。這種一般 script 載入方式也支援本機 `file://`，不用啟動伺服器或處理 fetch CORS。

- 每個活動使用不同且穩定的 `meta.festivalId`，例如 `my-festival-2027`。
- `dayId`、舞台 `id`、場次 `id` 在各自清單內必須唯一；場次必須參照存在的日期及舞台。
- 場次 ID 不必採用特定命名格式，可用 `opening/main/session-01` 等結構；不要任意更換已發布場次的 ID，否則舊勾選將失去對應。
- 新活動保持 `compatibility.legacyStorageKeys: []` 與 `acceptLegacyShare: false`，避免接受其他活動的未標記舊資料。

### 2. 客製網頁標題與主題

同樣只需編輯 `data/festival.js`：

| 設定 | 用途 |
| --- | --- |
| `meta.festivalName` | 頁面活動名稱及匯出標題 |
| `meta.pageTitle` | 瀏覽器分頁標題；省略時依活動名稱產生 |
| `meta.officialUrl` | 官方資訊網址；省略即隱藏入口，僅允許 HTTP(S) |
| `meta.timezone` | 活動所在地 IANA 時區，例如 `Asia/Taipei` |
| `meta.themeColor`、`meta.icon` | 主題強調色與圖示 |
| `meta.venue` | 行事曆場地 |
| `stages[].color`、`shortName`、`subtitle` | 舞台色彩、簡稱與副標題 |
| `description.isAIGenerated` | 是否在該場介紹顯示 AI 警語 |
| `ui.memberColors`、`ui.memberAvatars` | 團友可選色盤與頭像 |
| `ui.timeBands` | 落日、休息等選填時間帶；不需要可留空 |

主頁與使用說明共用活動設定，不必到 HTML 或引擎內搜尋替換活動名稱。

### 3. 部署到 GitHub Pages

上傳專案檔案，在儲存庫 **Settings → Pages** 選擇 **Deploy from a branch → main → / (root)**。所有資源使用相對路徑，可部署於專案子路徑或自訂網域。

若複製此專案建立另一個網站，請更新或移除副本中的 `CNAME`，再設定自己的自訂網域；本儲存庫原有的 `CNAME` 保持不變。

## 資料結構與驗證

完整範例：`festival-config.sample.json`。編輯器可參考 `festival-config.schema.json`；執行時由 `core.js` 額外檢查 ID 唯一性、參照、真實日期、時間範圍及 IANA 時區。

必要資料：

| 區塊 | 欄位 |
| --- | --- |
| `meta` | `festivalId`、`festivalName`、`timezone` |
| `days[]` | `dayId`、`label`、`date`、`timeRange.start/end` |
| `stages[]` | `id`、`name`、`color` |
| `events[]` | `id`、`dayId`、`stageId`、`name`、`start/end` |

`description` 可省略，包含選填的 `genre`、`country`、`highlight`、`summary` 與 `isAIGenerated`。介紹僅接受純文字，不支援 HTML 或 Markdown 渲染。

所有時間使用 24 小時制 `HH:MM`，日期使用 `YYYY-MM-DD`。例如：

```json
{
  "dayId": "night",
  "label": "夜間場",
  "date": "2027-05-01",
  "timeRange": { "start": "18:00", "end": "02:00" }
}
```

這代表 5 月 1 日 18:00 至 5 月 2 日 02:00。該日期的 `00:30` 演出會歸到次日凌晨；`23:50–00:40` 也會正確跨日。起迄相同不代表 24 小時，而是無效範圍；超出所屬日期 timeRange 的場次會報錯。跨午夜時先設定好日期的 timeRange，再加入演出。

不同日期分組若實際時間重疊，也會列為衝堂。夏令時間切換時，不存在或重複的本地時間會顯示錯誤，不會猜測時差；目前設定格式無法指定重複時段中的哪一次，請改用不歧義的時間或活動分組。空檔不包含步行、排隊或休息時間。

目前上限為 366 個日期、50 個舞台、10,000 場演出、100 位成員，分享片段最多 262,144 字元。編碼後網址仍可能超出通訊軟體或瀏覽器可用長度，請依實際分享管道測試。

## 本機紀錄、分享與舊版相容

本機儲存鍵為 `timetable_picks_<festivalId>`。除了瀏覽器與網站來源，活動識別也會隔離資料。

分享依然使用 `#share=Base64...`，內容升級為：

```json
{ "schemaVersion": 2, "festivalId": "活動識別", "users": [] }
```

- 分享內容是當下快照，不會即時同步。修改後需重新複製並分享。
- 匯入前驗證活動與版本、成員資料及場次 ID；不同活動或未知場次會拒絕匯入，不覆蓋目前紀錄。
- 已有成員時，匯入需確認整份取代，不會自動合併。
- 分享是 Base64 編碼，並未加密；持有網址的人能讀取成員及選團資料。
- 主頁「清除全部紀錄」僅清空目前活動，不刪除其他活動、已分享連結或他人的副本。

目前的活動設定明確宣告 `vagabond2026_schedule_v1` 舊鍵與舊版陣列分享相容：只有新鍵尚不存在時才複製舊紀錄，保留舊鍵作備份；新鍵已有空紀錄也不會重新遷移。仍支援舊 `#share=` 及 `#cloud=` 陣列網址。

舊版分享沒有活動識別，無法完整確認來源；因此這項相容預設關閉，只在原活動設定啟用。重新建活動時不要沿用這些相容選項。

## 匯出

| 功能 | 範圍 |
| --- | --- |
| CSV | 所有日期、全部場次及所有成員；不受畫面篩選影響 |
| ICS 行事曆 | 目前成員所有日期的已選場次；依活動時區換成 UTC，匯入後由行事曆以所選時區顯示 |
| 文字清單 | 目前成員已選場次，依設定的日期順序分組，包含舞台簡稱 |

CSV 會跳脫引號、逗號及換行，並防止文字被試算表視為公式。ICS 會跳脫文字、折行並提供穩定事件 UID；不同日曆對重複匯入的處理可能不同。

## 安全、隱私與使用說明

所有設定與分享中的外部文字都經由 DOM `textContent` 填入；動態按鈕使用事件監聽，沒有以字串組成的 HTML／onclick。顏色及官方網址經驗證後才設定到對應屬性。

本工具不需要帳號或站方資料庫；成員與選團紀錄儲存在使用者瀏覽器。不代表所有服務零紀錄：目前頁面仍使用外部 Tailwind CDN 與 Google Fonts，GitHub Pages 及相關外部服務也可能處理 IP 等連線資料。完整操作、AI 提醒及隱私說明請開啟 `help.html`。

完整樣式與字型需要網路；這不是離線快取 PWA。本機直接開啟可載入活動資料，但不同瀏覽器的 file:// 本機儲存／剪貼簿政策可能不同；儲存失敗時會提示，分享給他人請使用已部署的公開網址。

## 檔案結構

```text
index.html                    通用頁面結構
app.js                        DOM 渲染、操作、保存與分享
core.js                       設定驗證、時間計算、資料規則及匯出
style.css                     時間軸與主題樣式
data/festival.js              目前活動唯一執行設定
festival-config.sample.json   新活動範本
festival-config.schema.json   結構介面（JSON Schema）
help.html                     通用使用與隱私說明
CNAME                         原站自訂網域
tests/engine.test.cjs         功能、安全及多活動回歸測試
```

## 開發測試（僅維護者需要）

安裝 Node.js 20 或更新版本後：

```sh
npm ci
npm test
```

套件只用於本機 DOM 模擬測試，不會成為網站依賴，也不需部署 `node_modules`。測試涵蓋現有演出資料、不同天數／舞台數、跨午夜與時區、XSS 輸入、分享相容與拒絕匯入、活動儲存隔離、成員操作、搜尋及匯出。DOM 測試不等於跨瀏覽器視覺或完整滲透測試。
