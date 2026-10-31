# 31/10/2026 · Dragonhold · Thoát về màn tựa khi màn tựa còn đang tải

Sửa lỗi người kiểm lại tìm ra sau khi gộp `dh-codex` vào `main` (`25b602f`).

## Lỗi

- **Nút Quit trong bảng Settings mở từ chính màn tựa** (lúc màn tựa còn tải từ vựng hay đang báo lỗi tải) gọi `title.reopen()`. Hàm này ép màn tựa về trạng thái "sẵn sàng" dù chưa có từ vựng: nút Retry biến mất, bấm Start thì lỗi.
- **Quit trong 1,5 s chờ âm phím** không xoá cờ `beginWhenPlayable`, nên một lượt chơi tự bắt đầu sau màn tựa.

## Sửa

- `quitToTitle` ghi lại `hadRun` trước khi dỡ lượt chơi. Chỉ khi có lượt chơi mới gọi `title.reopen()`; Quit từ màn tựa thì giữ nguyên trạng thái của màn tựa.
- `quitToTitle` đặt `beginWhenPlayable = false`.

## Kiểm

- `pnpm check`: 698 test qua, 1 bỏ qua; tsc và build xanh.
- Build lại `dist` bằng `pnpm build:dragon` ở repo cha (có `VITE_TYPING_FEEL_ORIGIN` và `VITE_PORTAL_URL`).
