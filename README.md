# Dragonhold

Chạy `pnpm deploy:pack` để build rồi kiểm thư mục `dist` bằng bộ kiểm của kit
với `--game dragon-hold`; lệnh dừng nếu build hoặc kiểm gói thất bại.

`VITE_PORTAL_URL` là URL cổng game được ghim lúc build, mặc định trống. Khi
trống, màn kết quả chỉ có Replay/Retry, không tạo nút “Back to portal”; cầu nối
học tập giữ sự kiện trong hàng đợi cục bộ, kể cả khi game nằm trong iframe.
Muốn hiện nút, đặt một URL HTTP(S) tuyệt đối, không chứa thông tin đăng nhập.
Nút giữ nguyên đường dẫn, query và fragment; cầu nối chỉ dùng phần nguồn
(giao thức, tên miền, cổng) để gửi và kiểm tra `postMessage`.

```sh
# Bản phát hành độc lập, tắt cổng kể cả khi môi trường đang đặt biến.
VITE_PORTAL_URL= pnpm deploy:pack

# Bản phát hành có cổng riêng.
VITE_PORTAL_URL=https://portal.example/learn/ pnpm deploy:pack

# Bản demo nhà: đặt cổng ngay khi build, cho phép nguồn local lúc kiểm gói.
VITE_PORTAL_URL=https://typing-game.local/ pnpm deploy:pack:local

# Chỉ build demo, chưa kiểm gói.
VITE_PORTAL_URL=https://typing-game.local/ pnpm build
```

`pnpm deploy:pack:local` thêm `--allow-local-host`; các kiểm tra còn lại giữ
nguyên. Cờ này chỉ cho phép nguồn local, không tự đặt URL. Biến cũ
`VITE_PORTAL_ORIGINS` không còn cấu hình nút; chuyển sang `VITE_PORTAL_URL`.
Cũng có thể đặt biến trong file môi trường Vite tương ứng; sau khi đổi cần
build lại. URL sai định dạng làm build dừng. Giá trị local còn trong bundle
vẫn bị `deploy:pack` production từ chối.

Vite thay mặc định `PARENT_ORIGIN` của cầu nối trong mã đang biên dịch, không
ghi lại file kit đã ghim. Nếu khai báo kit đổi cấu trúc, bước này dừng để
kiểm tra lại. `src/kit/**` và manifest giữ nguyên byte.

Hai lệnh đóng gói chỉ build và kiểm file tại máy, chưa tải media hay đưa gói
lên máy chủ. Vite chép bản từ vựng đã ghim trong `public/vocabulary/` vào
`dist/vocabulary/`, gồm index, manifest, 100 level và `ATTRIBUTION.md`.

### Ảnh icon UI

Chạy `pnpm prepare-ui-art --art-src ../dragon-hold/art-src` trong worktree để đóng gói bảng chọn `src/ui/ui-art.json` thành WebP 64/128/256 và manifest trong `public/assets/dragon-hold/ui/icons/`. Dùng thêm `--check` để kiểm nguồn, MD5 và byte mà không ghi file; `--out <dir>` đổi thư mục xuất. Đặt `ART_MAGICK=/opt/homebrew/bin/magick` trên Mac. Script chỉ thu nhỏ khi thiếu cỡ, không phóng to; ảnh dưới 35 dB PSNR được xuất lossless. Khi nhận icon thay thế, cập nhật `source` và `interim` trong bảng rồi chạy lại lệnh.
