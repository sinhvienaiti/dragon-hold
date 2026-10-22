# 23/10/2026 · M0a: khung repo, kiểu dữ liệu, dữ liệu M0, hợp đồng sim

Mốc M0a "hộp xám" (DESIGN.md §9). Bước này dựng nền để các làn làm song song.

## Đã làm

- Tạo repo `games/dragon-hold`: Vite 7, TypeScript strict, `three@0.170.0` ghim, cổng 3005 (`--strictPort`), font Be Vietnam Pro và Cormorant Garamond.
- `.gitignore` chặn mọi media (ảnh, âm, video, `.glb`, `.gltf`, `.bin`, `.ktx2`), `public/assets/**`, `art-src/`, `tmp/`.
- `kit.config.json` khai 11 module kit. Kit chưa được commit: bước nối sẽ chép đủ kit vào `src/kit/`.
- Vite phục vụ `/vocabulary/` và `/typing-texts/` chỉ đọc từ `shared/` của repo cha (bản chép cách làm của Space, tới khi có plugin trong kit).
- `src/content/types.ts`: mọi kiểu M0. Quái, tướng, bẫy, nhà, lính, đồ tiêu hao, bản đồ, đợt, ải, lệnh vào sim, sự kiện ra khỏi sim. Loại sát thương `word` (Chữ) bỏ qua giáp.
- `src/content/rules.ts`: số chuẩn M0, mỗi số ghi mục của `00-canon.md` (hoặc 01–03 khi 00 trỏ sang).
- `src/content/data/maps.ts`: bản đồ `L2-cau`. Đường Cầu qua cầu (điểm nghẽn), Đường Suối lội suối (chậm 30 %, Ướt 4 s), Đường Trời cho quái bay. 7 ô bẫy, 4 điểm giữ, 6 bệ nhà.
- Dữ liệu M0 điền sẵn từ thiết kế: 6 quái (E09, E11, E18, E19, E01, E25), tướng G01, 3 bẫy, Vệ Binh Rêu, Nhà Thuốc Lá, Bình Máu Nhỏ, Tim Rồng, Vảy Cứng. Kế hoạch 10 đợt có nhịp và tải; toán quái để làn sim-battle soạn.
- `src/sim/world.ts`: `createWorld`, `step` 60 Hz theo thứ tự cố định, hàng đợi sự kiện, `hashWorld`. Các hệ khác là file khung có chữ ký sẵn.
- File khung cho mọi làn: sim, gõ và học, view, UI, âm, bot.
- Test: ranh giới repo và độ thuần của sim; sim chạy 600 bước ra cùng mã băm; luật hình học bản đồ và nối dữ liệu M0.
- `AGENTS.md`, `LANES.md`: làn, file mỗi làn giữ, hợp đồng, danh sách sự kiện.

## Quyết định

- Số của luật nằm ở `rules.ts` có kiểu, thay cho `rules.json` mà 00 nhắc tới.
- Ải M0 dùng sức chương 2 (chương đầu có 2 đường). Trần quái sống 30 (C2 là 20) và hệ số Vàng 180 % vì ải có 10 đợt. Bot sẽ kiểm lại.
- Sim không dùng lượng giác, `pow`, `**` (05 §9.4). Vị trí là số nguyên, 1 m = 60 000 đơn vị.
- Máu Hỏa Long nhân g(c) như sát thương quái.

## Còn lại cho bước nối

- Chép đủ kit (thiếu `three`, `feedback` lúc 05:39) và commit `src/kit/`.
- Đổi Vite sang plugin `tools/` của kit.
- `src/app/app.ts` mới hiện dòng báo "đang dựng"; làn nối ráp sân khấu, sim, vòng lặp, phím.
