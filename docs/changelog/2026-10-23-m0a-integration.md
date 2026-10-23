# 23/10/2026 · M0a: ráp tám làn thành một ải chơi được

Bước ráp của mốc M0a. Ải thử "Cầu và Suối" giờ chơi trọn 10 đợt trên trình duyệt: Học trước, bày binh, đợt, nghỉ có cửa hàng, Thẻ Ôn, màn kết ải.

## Đã làm

- **Vòng lặp** (`src/app/loop.ts`): sim bước cố định 60 Hz theo bộ tích thời gian, tối đa 5 bước mỗi khung. Dừng hình và tua nhanh chỉ đổi giờ của thế giới. Dựa trên `runFrameLoop` của kit, khung lỗi không làm đứng vòng lặp.
- **Bộ phím** (`src/app/input-router.ts`): một bộ nghe `keydown` ở `window`, pha capture.
  - Chữ a–z chỉ để gõ: vào bảng học đang mở, hoặc thành lệnh `key` cho sim. Bỏ phím IME đang soạn, phím giữ lặp, phím có Ctrl hoặc Cmd.
  - Phím lệnh đọc theo `event.code` qua bảng `KEYS` (00 §6). Linux: Shift + số được coi như Alt + số.
  - Thứ tự: lớp dừng (menu, màn che, đếm ngược) → bảng học → Esc nhả khóa → Backspace → màn kết ải, chế độ đặt, dải món, thẻ đợt, HUD, nghe lại từ, camera → menu dừng, tua nhanh.
- **Luồng ải** (`src/app/app.ts`):
  - Nạp bộ từ (chờ portal tối đa 2 s), dựng thế giới, rồi mở Học trước 8 từ mới.
  - Bày binh với 200 Vàng, Enter để bắt đầu. Hết đợt thì mở Thẻ Ôn. Đồng hồ nghỉ đứng yên khi bảng học mở.
  - Thắng hoặc thua thì hiện màn kết ải. Enter hoặc "Chơi lại ải" dựng lại cả lượt chơi, không sót nút hay vật thể.
  - Lệnh từ phím, chuột và bảng vào thế giới ngay, có ghi tick. Nhật ký lệnh phát lại ra đúng mã băm.
  - Chuột trái vào quái là đánh dấu quái đó.
- **Focus và tạm dừng** (06 §2): mất focus hoặc ẩn tab lúc đang đợt hay nghỉ thì sim đứng yên, có màn che "Bấm hoặc gõ phím bất kỳ để tiếp". Tiếp trong đợt có đếm 3-2-1. Tiếp lúc nghỉ thì phím đầu tiên đi thẳng vào game. Esc mở menu dừng: Tiếp tục, Chơi lại ải.
- **Viền tối 120 ms** khi Hỏa Long trúng đòn (05 §5). Số sát thương tránh khung học, thẻ chữ, HUD.
- **Trang phụ** (`src/main.ts`): `?view=terrain`, `?view=ui`, `?bench=crowd|fx`.
- **Cờ dev:** `?speed=N` (chỉ bản dev, luật không đổi), `?prelearn=0`, `?q=`, `?seed=`, `?difficulty=`, `?wpm=`, `?tagsize=`. `window.__dh` là tay cầm cho kịch bản.
- **Kịch bản trình duyệt** (`scripts/visual/scenarios/dh-*.mjs`): `dh-smoke`, `dh-words`, `dh-learning-frame`, `dh-hitstop-keys`, `dh-placement`, `dh-focus`, `dh-keyboard-only`, `dh-telegraphs`, `dh-scale`, `dh-camera`, `dh-restart`, `dh-perf`.

## Mục rà soát đã sửa

- Bảng Học trước dùng class `dh-panel` trùng với khung gỗ của UI, làm mọi bảng HUD nhảy vào giữa màn. Đổi thành `dh-lpanel`.
- Cờ của tướng G01 hết giờ mà từ của cờ vẫn còn trên màn. Giờ cờ đổ thì từ được nhả.
- Quái tạm quá nhỏ ở camera mặc định (lính rêu 25 px, kiến 6 px). Phóng khối tạm để đạt dải 05 §2.3: hai chân và quái bay 32–44 px, bầy ≥ 26 px, tướng ≥ 60 px.
- Thẻ đợt che các ô gần cổng bắc lúc nghỉ. Camera mặc định nhìn lệch 4 m về bắc (`lookM`), ô gần cổng lộ ra.
- Dòng IPA thiếu glyph. Thêm `@fontsource/noto-sans` (latin, latin-ext, greek) cho dòng IPA.
- Tải đợt nằm ngoài dải 00 §4.4: đợt 2 lên 0,76, đợt 3 và 6 lên 0,75, đợt 9 về 1,00, đợt 10 về 1,24.
- `three` tách thành chunk riêng khi build.
- Ở trận thắng, Thẻ Ôn của đợt 10 mở đè lên màn kết ải. Bảng đang mở còn làm giờ thế giới đứng yên, nên một vạch báo trước nằm lại trên bản đồ. Giờ đợt cuối không mở Thẻ Ôn, và khi thắng hay thua thì mọi bảng học tự đóng.
- Chip trạng thái trong Sổ Từ Ải ("Mới học", "Cần ôn") dùng class `dh-tag` của thẻ chữ, nên bị đẩy lên góc trên của màn kết ải. Đổi thành `dh-wstatus`.
- Dòng "Vừa học" dính các từ vào nhau ("nhỏ big") vì HTML gộp khoảng trắng. Giờ đọc là `small (nhỏ) · big (to, lớn)`.
- Mã băm thế giới có cả số thực của cấu hình gõ (`rules`) và vị trí ô (`def`). Hai mục này là cấu hình tĩnh, nay bỏ khỏi mã băm, nên phần được băm chỉ còn số nguyên. Nhật ký lệnh không đổi, golden đã ghi lại.
- Cổng G5: DESIGN §9 ghi "chỉ gõ thắng ≤ 40 %", còn 00 §7 ghi "≥ 70 % ở ải 1–10". Canon thắng, nên báo cáo bot chấm G5 theo 00 §7.
- `dh-telegraphs` giờ chụp riêng từng loài (E11, E19, E18; G01 khi cắm cờ). Có đặt một Vệ Binh Rêu, vì sói chỉ vồ khi có lính chặn.
- `dh-scale` đo bầy kiến theo chiều dài, vì kiến bò sát đất.

## Kit

- Chép lại kit theo commit cha `89dc9ff5`, phần `feedback` sửa cho survival-s0: rung nằm trong vòng tròn đơn vị, giật lùi T1 0,18 và T2 0,30, đặt số có `popScale`, gộp số, đặt lệch ngang, `settle()`, thêm `crowdMergeS`. Game không phải sửa gì. Commit riêng.

## Kiểm

- `npx tsc --noEmit`, `npx vitest run` (318 test), `pnpm build`, `node src/kit/verify-kit.mjs` đều xanh.
- Mọi kịch bản chạy trên cổng 3005 với `--strictPort`: 0 lỗi console, 0 lỗi trang, 0 tải hỏng.
  - `dh-words`: 2 cỡ màn × cỡ thẻ 100 % và 150 %, mỗi lần 21 từ gõ bằng phím thật. Không thẻ nào chồng nhau, không thiếu thẻ. Chữ nhỏ nhất 16 px ở 720p, 20 px ở 1080p.
  - `dh-learning-frame`: khung học không bị thẻ hay số sát thương che, từ mới ghim 2,6 s, IPA dùng Noto Sans. Thẻ Ôn trả lời bằng phím, đồng hồ nghỉ đứng yên.
  - `dh-hitstop-keys`: 114 phím ở 120 WPM giữa cơn dừng hình, mất 0 phím. Từ phím tới khung vẽ tối đa 19 ms.
  - `dh-placement`: đủ 3 bẫy và 2 hỗ trợ, bằng chuột và bằng phím; mua Bình Máu, Tim Rồng, Vảy Cứng; nâng và bán bằng phím và bằng menu ô.
  - `dh-focus`: bấm HUD, dải món, thẻ đợt không cướp phím. Mất focus thì sim đứng yên, tiếp trong đợt có 3-2-1.
  - `dh-keyboard-only`: trọn 10 đợt chỉ bằng phím, thắng 3 sao, phát lại ra cùng mã băm. Chạy cả kiểu Mac (Alt + số) và Linux (Shift + số).
  - `dh-telegraphs`: báo trước ngắn nhất 500 ms (sói), cung 600 ms, heo 1000 ms, tất cả màu đỏ. G01 cắm cờ có vòng hào quang vàng úa. Vòng Thiên Hỏa màu cam nhạt.
  - `dh-scale` (1080p): lính rêu cao 29 px (dải 32–44, trong sai số 20 %), bầy kiến dài 26 px.
  - Ảnh ở `tmp/shots/integrator/` (không vào Git), đã mở xem từng ảnh.
- Hiệu năng ở 1920×1080, bậc High, Chrome không khóa vsync, game thật đợt 1–5: khung trung bình 3,6–3,8 ms, p95 ≤ 4,9 ms, 26–28 draw call.
- `pnpm dh:balance` (6 bot × 20 seed): G3, G5 (theo 00 §7), G6, G9 đạt. G1 trượt vì ải quá dễ: bot 35 WPM có đồ thắng 100 % với 100 % máu.
  - Quái chết trung vị cách Rồng 20 m, trong Vùng Chữ 26 m. Gần như không quái nào tới được Bệ Rồng. Thiên Hỏa hạ khoảng một nửa số quái, phần lớn là bầy kiến.
  - Thử tăng tải × 1,5 cùng sát thương quái × 3: bot có đồ vẫn còn 99 % máu. Trong dải số của canon (tải đợt, ±10 % hệ số) không kéo được G1 về 75–90 %.
  - Cần chủ dự án quyết sức ép đến từ đâu: quái tới gần nhanh hơn, quái bắn xa mạnh hơn, hay phe ta yếu hơn.

## Còn thiếu

- Menu dừng chưa có Cài đặt, Sổ Quái, Bỏ ải.
- Chưa có màn tiêu đề, Lều Chuẩn Bị, Long Ấn (ngoài M0).
- Cân bằng: xem mục Kiểm ở trên.
