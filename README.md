# Dragonhold

Chạy `pnpm deploy:pack` để build rồi kiểm thư mục `dist` bằng bộ kiểm của kit
với `--game dragon-hold`; lệnh dừng nếu build hoặc kiểm gói thất bại. Bản demo
nhà dùng `pnpm deploy:pack:local`, thêm `--allow-local-host` để chấp nhận nguồn
portal `typing-game.local`; các kiểm tra khác vẫn giữ nguyên. Hai lệnh chỉ
build và kiểm file tại máy, chưa tải media hay đưa gói lên máy chủ. Vite chép
bản từ vựng đã ghim trong `public/vocabulary/` vào `dist/vocabulary/`, gồm
index, manifest, 100 level và `ATTRIBUTION.md`.
