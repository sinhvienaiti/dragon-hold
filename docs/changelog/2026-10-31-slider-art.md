# 31/10/2026 · Dragonhold · Thanh trượt bảng Sound mang ảnh thật

Worktree `games/.wt-dh-sliders`, nhánh `dh-sliders`. Gắn ảnh rãnh và núm đã nhận vào bảng Sound, theo phiếu 225 (`docs/codex-queue/225-settings-slider-art.md` ở repo cha; núm của 225, rãnh của phiếu 241 bản `c2-try3`). Không sửa `src/kit`, không đổi luật, ván vàng giữ nguyên.

## Ảnh

- Chép sáu bản thu của phiếu từ `art-src/ui/quick-settings/sliders/` sang `public/assets/dragon-hold/ui/quick-settings/` (cạnh khung bảng, nút và icon đã có), giữ nguyên byte (md5 khớp nguồn):
  - rãnh `slider-track.png` (1024 × 64) và `slider-track.512.png` (512 × 32);
  - núm `slider-thumb.png` (1024²), `.256.png`, `.128.png`, `.64.png`.
- Ảnh là media, không vào Git. `media.md5` **chưa** có sáu dòng này: lúc gắn đang chạy `media:push`, nên không sửa file đó; điều phối thêm dòng và đẩy Drive sau.

## Mã

- `src/app/quick.ts`: `QUICK_SKIN` gom ảnh của bảng: khung `panel-large.alpha.png`, nút `button.alpha.png`, rãnh `slider-track.png`, núm `slider-thumb.128.png`. `quickOptions` truyền `skin: QUICK_SKIN`.
  - Ở 1080p rãnh dài khoảng 306 × 15 px CSS (sau lượt sửa padding) và hộp núm 42 px. Bản rãnh 1024 và núm 128 vẫn nét trên màn 2×; bản 512 và 64 để dành.
- `src/app/app.css`: dưới hộp rãnh kit tô màu `--kit-qs-line`, dưới ô vuông của núm tô `--kit-qs-text` (`css.ts:73–76`). Núm tròn và rãnh có đầu bo, nên hai màu đó lộ ra thành ô vuông trắng quanh núm. Luật `.dh-quick.kit-qs--skin-slider` bỏ hai màu đó (WebKit và Gecko tách luật riêng), chỉ còn ảnh. Lượt sửa sau duyệt (dưới) đổi thêm cách vẽ rãnh và cỡ núm.
- Vòng focus của kit (`--kit-qs-focus`, vàng `#FFD166`) giữ nguyên quanh cả ô range.

## Sửa sau duyệt (31/10)

Người duyệt độc lập báo 7 mục (4 P2, 3 P3). Dragonhold sửa:

- **Đầu rãnh bị kéo giãn 1,5 lần (P2, ghi ở mục Wordwoven, Dragonhold cùng lỗi nhẹ hơn).** Kit kéo cả ảnh 1024 × 64 phủ rãnh (`100% 100%`), rãnh ở đây dài tới 24:1 nên đầu chữ V bè ngang. Nay rãnh vẽ ba lát bằng `border-image: var(--kit-qs-skin-track) 0 64 fill / 0 calc(10px * s) stretch` (đo ảnh: đầu vàng hết ở cột 27 bên trái, từ cột 995 bên phải; lát 64 px cho đầu đúng tỉ lệ 10 × 10 px ở cỡ 1, cao bằng rãnh), chỉ phần giữa giãn. `background: none` thay cho nền trong suốt cũ.
- **Số bên phải chạm viền vàng trong của khung, số Interface đè lên hoa văn góc dưới (P2, có từ trước).** Khung bị kéo theo hộp bảng: viền vàng trong nằm khoảng 8,5 % vào từ hai cạnh và 10,7 % lên từ đáy (đo `panel-large.alpha.png`: lề trong suốt 54 px, mép trong 104/1148/1120 trên 1254). Padding đổi `52 44` thành `52 62 64` (nhân `--kit-qs-s`): ở 1280 số cách mép vàng 15 px, hàng cuối cách đáy 19 px; ở 1920 là 23 và 31 px. Chữ "Sound" cũng rời mép trái. Hàng Master (có Mute) vẫn một dòng ở 1280 (rãnh 108 px).
  - Luật 600 px: `44px 30px` thành `48px 56px 60px`. Ở 560 × 900 số đã rời mép (487 so với mép vàng 499), nhưng bảng cao 808 px nên khung bị kéo dọc dày ra và tiêu đề, hàng cuối vẫn chạm khung trên/dưới. Có từ trước; cần vẽ khung chín lát (xem Còn mở).
- **Núm nhỏ: chỉ khoảng 15 px ở 720p (P3).** Hộp núm 22 thành 28 px (`margin-top: -9px`, nhân `s`), ô range cao 28 px theo, nên vòng focus vẫn ôm núm. Núm thấy được khoảng 20 px ở 720p, gấp đôi rãnh; ảnh 128 vẫn nét tới 42 px CSS trên màn 2×.
- **Hộp CSS quanh ảnh (P3, có từ trước; phần rẻ).** Ảnh khung và nút có lề trong suốt, kit tô `--kit-qs-bg` dưới bảng và `--kit-qs-control` (xanh nhạt `--kit-qs-accent` dưới Resume và Mute đang bật) dưới nút, lộ thành khối phẳng quanh ảnh. Nay bảng và nút chỉ còn ảnh: nền và viền trong suốt. Resume và nút đang bật đọc bằng chữ vàng `#f2c14e` trên cùng ảnh; rê chuột làm ảnh sáng lên (`filter: brightness(1.18)`) thay viền vàng của kit.
- Hai mục không phải của Dragonhold: rãnh lệch và chữ Resume tối (Wordwoven). Mục "sáu cỡ ảnh, chưa thử Firefox" để điều phối quyết (xem Còn mở).

## Kiểm

- `pnpm check` xanh (mã thoát 0): `verify-kit`, 77 file test, 700 test qua và 1 bỏ qua, `tsc --noEmit` và build.
- Test trong `tests/app/quick-settings.test.ts` (đọc `app.css` thành bảng luật theo selector, vì DOM giả không có cascade):
  - gốc bảng có lớp `kit-qs--skin-slider`, `--kit-qs-skin-track` trỏ `slider-track.png`, `--kit-qs-skin-thumb` trỏ `slider-thumb.128.png`;
  - rãnh WebKit và Gecko: `background: none` và đúng `border-image` ba lát; núm: nền trong suốt, 28 × 28, `margin-top` −9 (WebKit); ô range cao 28; không luật nào gộp `::-webkit-` với `::-moz-`;
  - Resume mang lớp `kit-qs__btn--primary`, Mute bật có `aria-pressed="true"`; bảng và nút có nền trong suốt, viền nút trong suốt; Resume, nút bật và nút chọn chữ `#f2c14e`; padding bảng `52 62 64`.
  - Thử đột biến: đổi lát 64 thành 56, `margin-top` −9 thành −6, padding ngang 62 thành 44, chữ vàng thành xanh: mỗi lần test đỏ (mã thoát 1), rồi trả file.
- Trình duyệt thật (Chrome headless qua `scripts/visual/cdp-run.mjs`, Vite cổng 3181 cho lượt gắn, 3185 cho lượt sửa, `?title=0`), 1280 × 720 và 1920 × 1080:
  - F1 mở Settings, F2 mở Sound, Esc đóng;
  - mọi thanh ở 0, 50, 100 %, số bên cạnh khớp;
  - bàn phím: Tab tới Master, có `:focus-visible` và viền vàng; Home 0, → 1, → 2, PageUp 12, End 100, ← 99, Home 0;
  - chuột: bấm vào rãnh ở 30, 0, 100, 73 % (tính theo núm 28 px) ra đúng 30, 0, 100, 73, nên tâm núm nằm dưới con trỏ; kéo núm Music xuống 20, quá mép phải thành 100, quá mép trái thành 0, thả ở 64;
  - Mute bật: chữ vàng, không nền; bấm lại tắt;
  - đầu rãnh phóng 4×: chữ V đúng tỉ lệ; không lỗi trang.
  - Tờ xem lượt sửa: `tmp/ui-wire/fix/1280/contact-sheet.jpg`, `tmp/ui-wire/fix/1920/contact-sheet.jpg`, số trong `result.json` cạnh mỗi tờ; `tmp/ui-wire/fix/narrow/` cho cỡ 560 × 900. Tờ của lượt gắn ở `tmp/ui-wire/1280|1920/` đã cũ. Ảnh thô đã xoá bằng `tools/capture-prune/prune.mjs`.
- Worktree nối `public/assets/dragon-hold` tới thư mục media của bản chính (`games/dragon-hold/public/assets/dragon-hold`, symlink, ngoài Git).

## Còn mở

- `media.md5` thiếu sáu dòng ảnh thanh trượt (chờ `media:push` đang chạy xong). Game chỉ dùng `slider-track.png` và `slider-thumb.128.png`; điều phối quyết có giữ bản núm 1024 (920 KB), `.256`, `.64` và rãnh `.512` trong `public/` (chúng vào `dist` mà không ai tải) trước khi thêm dòng `media.md5`.
- Chưa thử trên Firefox (máy không có): các luật `::-moz-range-*` mới chỉ được kiểm bằng đọc CSS.
- Danh sách âm phím (Off/Dragonhold) và chip Quality (Low/Medium/High/Ultra) vẫn là khối CSS phẳng màu xanh nhạt của kit; hàng Keyboard volume chưa có icon. Cần ảnh chip/danh sách và icon: một lượt ảnh UI riêng.
- Khung bảng kéo giãn theo hộp: bảng Settings thấp làm hoa văn góc bẹp dọc, bảng rất cao (màn hẹp ≤ 600 px) làm khung trên/dưới dày ra chạm tiêu đề và hàng cuối. Nên vẽ khung chín lát (`border-image` như Wordwoven) trong lượt ảnh UI đó.
- Kit nên tự vẽ rãnh ba lát và bỏ màu nền dưới ảnh rãnh, núm, khung, nút khi có `skin` (sửa `shared/game-kit/ui/quick-settings/css.ts`, có thể nhận độ rộng lát đầu rãnh qua `QuickSkin`), để game không phải tự viết luật như trên và Last Line cũng được.
