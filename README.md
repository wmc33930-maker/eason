# 帶財商號｜財神爺幸運刮刮卡

這是可部署的網站原始碼包，**目前不是已上線的正式網站**。

## 功能
- 財神爺紅金模板與銀色刮刮區
- iPhone、平板觸控及電腦滑鼠操作
- 後台新增、刪除、編輯獎項名稱、金額及中獎機率
- 儲存前驗證機率總和為 100%
- 批次建立 1–5000 張卡片，每張有獨立網址
- 台灣日期編號 `YYYYMMDD-001`，每日重新編號；舊網址仍有效
- 管理後台可查看已建立卡片與刮開狀態
- 無外部 npm 依賴，使用 Node.js 20

## 部署前必讀
1. 將本資料夾內的所有檔案上傳到一個 GitHub repository 的根目錄，至少包含 `Dockerfile`、`package.json`、`server.js` 和 `public/caishen-template.jpg`。
2. 在 Railway 將該 repository 連接為服務來源，使用 Dockerfile 建置。
3. 設定環境變數：
   - `ADMIN_KEY`：自行設定長且唯一的管理密鑰，不要使用公開或容易猜測的密碼。
   - `PORT=3000`
   - `DATA_DIR=/data`
   - `PUBLIC_BASE`：正式網站網址，例如 `https://你的服務.up.railway.app`；網址結尾不要加 `/`。
4. 在 Railway 為服務新增持久化 Volume，掛載路徑必須是 `/data`。沒有持久化 Volume 時，資料可能在重新部署或容器重建後遺失。
5. Healthcheck path 設為 `/health`。
6. 部署後先測試 `https://你的服務.up.railway.app/health`，預期回傳 `{"ok":true}`。
7. 管理後台為 `https://你的服務.up.railway.app/admin`。先建立少量測試卡，確認獎項、機率、刮獎結果、舊網址及資料重啟後仍存在，再提供給客人。

## 重要限制
- 獎項在建立卡片時就已分配，客戶刮開後顯示該卡結果。
- 本程式不是第三方支付、正式抽獎稽核或防作弊平台；若活動涉及正式獎項或大量金額，請先自行確認活動規則、法令及必要的稽核要求。
- 目前 Railway 上原有服務尚未成功運行此版本；不要把既有 Railway 網址當成已完成的正式網站。
