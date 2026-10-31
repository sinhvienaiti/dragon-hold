# 31/10/2026 · Dragonhold · Gộp `dh-codex` vào `main`: một màn tựa

Gộp tay nhánh `dh-codex` (Codex 187, 194, 195, 197, 223, 235 và sửa hàng Retry/Start `c96ef50`) vào `main` (Settings/Sound 192, âm phím Typing Feel B4). Nội dung 194/195/223/235 giữ như đã commit; sim, kit, golden (`m0.json` MD5 `75f74947…940e`) và `media.md5` không đổi.

## Một màn tựa

- Màn tựa tạm của `main` (khung `dh-panel dh-title` với nút Play, `titleOpen`, `playFromTitle`) bị bỏ. Màn tựa 197 (`src/ui/title.ts`) là màn duy nhất: lúc khởi động (trừ `?title=0`) và sau **Quit to title**.
- `quitToTitle` giữ việc dọn ván của 192, thêm reset tự tua 195 (`idleLatch`), rồi gọi `title.reopen()`. Với `?title=0` màn tựa được tạo lúc thoát lần đầu.
- `title.reopen()` và `reopenTitle()` mới (`title-state.ts`): `show()` của 197 từ chối trạng thái `started`, nên khi thoát màn tựa quay về `ready`, đủ bốn nguồn, focus ở Start. Đây là "hợp đồng reset title" mà 222 §6 nêu.
- Start lần đầu theo 197: có `?wpm=` thì vào trận ngay, không thì hỏi tốc độ. Sau Quit to title theo 192: đặt lại Học trước và chuỗi thua, luôn hỏi tốc độ.
- `begin()` vẫn chờ âm phím chơi được (cổng 1,5 s của B4), kể cả khi bấm Start trên màn tựa.
- Nút bánh răng và loa của 192 nằm trên màn tựa: lớp `QuickSettings` có `z-index` 100, trên màn tựa (40). `title.quickSlot` để trống và tự ẩn. Bộ định tuyến phím tạo sớm (197) nhưng sau `createQuickSettings`, nên F1/F2/Esc tới bảng trước, và bộ định tuyến bỏ qua phím khi bảng mở.
- CSS `.dh-title` của màn tựa tạm bị xoá khỏi `app.css`: một quy tắc `.dh-title` trần sẽ lại tràn sang mọi tiêu đề (lỗi F2 của 222).

## Chỗ gộp khác

- Chất lượng: `normalizeQuality(?q=)` rồi chất lượng đã lưu trong Settings, cả hai qua sàn bản phát hành của 195 (Low thành Medium). Hàng Graphics trong Settings dùng `allowedQualities(import.meta.env.PROD)`, như báo cáo 195 §4 giao cho lượt gộp.
- Cầu nối: `createPortalBridge()` (187) cùng giọng đọc theo âm lượng Voice của 192.
- `vite.config.ts`: giữ cả `typing-feel-preconnect` và `dragonhold-portal-origin`.
- `app.css`: giữ quy tắc `.dh-quick` của 192 và `.dh-deck-notice`, `.dh-ff` của 195.

## Test

- `tests/app/quick-settings.test.ts`: các test trong trận khởi động với `title: false`; test Quit to title kiểm màn tựa 197 (`.dh-title-screen`, trạng thái `ready`). Thêm hai test: màn tựa mặc định có bánh răng và loa, Esc đóng bảng về màn tựa, Enter thuộc về bảng đang mở, Start vào trận, Quit to title mở lại đúng một màn tựa và hỏi tốc độ; Start trước khi âm phím sẵn sàng thì trận bắt đầu ở mốc 1,5 s.
- `tests/app/deck-app.test.ts`, `tests/app/title-retry.test.ts`: stub audio nhận thêm `setMuted`, `setVolumes`, `setKeyboardEnabled`; mock `src/app/quick` (bảng cần DOM thật) và `stopSpeech`; số listener `keydown` so với số của app trước khi bộ từ lỗi (B4 thêm một listener preload).
- `tests/ui/title-reopen.test.ts` mới: `reopenTitle` thuần, và `title.reopen()` trên DOM.

## Build cho máy chơi

Có 187, bản build cần `VITE_PORTAL_URL=https://typing-game.local/` để giữ cầu nối tới cổng (trước đây là `PARENT_ORIGIN` ghi cứng trong kit) và hiện "Back to portal". Script `build:dragon` của repo cha chưa đặt biến này; dòng cần thêm nằm trong báo cáo gộp cho điều phối.
