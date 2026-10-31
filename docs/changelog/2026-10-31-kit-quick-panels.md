# 31/10/2026 · Dragonhold · Bảng Settings/Sound: kit da mới, phần đầy thanh trượt, tấm nút 32 px, danh sách âm phím trên tấm ảnh

Nhánh `main`. Đồng bộ kit từ repo cha `18722b41` (đợt da mới của `ui/quick-settings`, xem
`docs/changelog/2026-10-31-kit-quick-panels.md` ở repo cha) rồi đổi da hai bảng của Dragonhold chỉ bằng ảnh đã nhận và
đã gắn trong game (162 khung và nút, 225 núm, 241 rãnh, 180 icon). Không tạo ảnh mới, không gắn ảnh Codex đang làm
(244 phần đầy và rãnh rỗng, 245 tấm hàng danh sách và Close): khi có, chỉ đổi `QUICK_SKIN` trong `src/app/quick.ts`.

## Kit

`node scripts/sync-game-kit.mjs --target games/dragon-hold`: 7 file trong `src/kit/ui/quick-settings/` và manifest.
Mã game không phải sửa vì kiểu. `verify-kit` và `kit:sync --check` báo OK.

## Đã làm

- **Phần đầy của thanh trượt.** `sliderEmpty` là rãnh 241 nên lớp phần đầy của kit bật; phần đầy dùng lại chính rãnh
  đó (chưa có ảnh 244). Phần rỗng tối và xám (`grayscale(0.8) brightness(0.5)`), phần đầy sáng lên với quầng lửa
  (`brightness(1.35) saturate(1.4)` và `drop-shadow` cam). Ở 0, 50, 100 % hai phần khác hẳn nhau ở cỡ thật. Rãnh cắt
  `0 64`, đầu rãnh 10 px, núm 32 px (`--kit-qs-knob`), nên phần đầy dừng đúng tâm núm. Focus bàn phím làm ấm cả hai lớp
  rãnh. Hàng Master khi tắt tiếng làm tối cả `.kit-qs__slider` (trước là `.kit-qs__range`, nay chỉ còn làm tối núm).
- **Mọi rãnh dài bằng nhau.** Mute ở cột riêng 90 px (`--kit-qs-aside-w`). Bảng Sound rộng 640 px (theo tỉ lệ), không
  phải 560: rãnh từ 107,5 px lên 187,5 px ở 720p. Bỏ luật `flex-basis: 6em` (không còn tác dụng).
- **Nút và chip 32 px.** Ảnh nút 162 có lề trong suốt lớn (tấm thật 2102 × 433 trong ảnh 2172 × 724), vẽ kéo cả ảnh thì
  chỉ thấy một thanh mỏng khoảng 20 px. Nay vẽ chín mảnh: cắt ở lề cộng hoa văn góc (`PLATE_SLICE` 328 230 333 230),
  vẽ ở 32/433 cỡ ảnh, lề đẩy ra ngoài hộp (`border-image-outset`), nên tấm lấp đúng hộp 32 px (48 px ở 1080p), hoa văn
  góc giữ hình. Bỏ nền phẳng và góc bo của kit dưới ảnh.
- **Tấm đang bật.** Resume, Mute đang nhấn và chip đang chọn mặc ảnh `button-active` (nay qua trường
  `QuickSkin.buttonActive` của kit, thay biến riêng `--dh-qs-button-active`), sáng hơn (`brightness(1.18)
  saturate(1.25)`) với quầng lửa, chữ vàng `#f2c14e`. Rê chuột: sáng rõ (`brightness(1.3)`) kèm quầng. Focus bàn phím
  trên tấm đang bật cộng quầng vàng vào ánh sáng đó.
- **Danh sách âm phím trên tấm ảnh.** `listRow` dùng ảnh nút 162 với cùng cách cắt; dòng đang chọn dùng `button-active`
  (kit tự lấy từ `buttonActive`), sáng lên với quầng lửa, chữ vàng. Khung bo tròn và nền phẳng của listbox web không
  còn. Lề trong suốt của ảnh được kéo ra ngoài mỗi dòng (`LIST_ROW_VARS`), giữa hai tấm còn 2 px.
  - Danh sách lớn theo bảng: dòng, tiêu đề họ, icon nghe thử và tấm cắt đều nhân `--kit-qs-s` (kit vẽ 34 px ở mọi cỡ,
    nên ở 1080p chữ 22 px chạm mép tấm 30 px). Màn cảm ứng giữ tối thiểu 44 px như kit.
  - Danh sách cao khoảng 7,5 dòng (252 px ở 720p, kit 306): bảng Sound nay vừa trong khung ở mọi cỡ. Trước đó ở 720p
    hàng Interface tràn 46 px xuống dưới dải đá của khung.
- **Focus là quầng vàng lửa** (`--kit-qs-glow: #ffc14d`) ôm theo ảnh: nút, chip, dòng danh sách, núm, nút nghe thử.
- **Tựa bảng** bằng Cormorant Garamond (`--dh-font-title`, đã nạp ở `ui/skin.ts`), 28 px, vàng.
- **Icon mọi hàng có ảnh đã nhận:** bảy hàng bảng Sound; Keyboard volume dùng tạm icon `vol-keyboard` tới khi icon
  riêng (244) được nhận. Hàng Quality chưa có icon nào được nhận: ô trống giữ chỗ, nhãn vẫn thẳng hàng.

Tệp: `src/app/quick.ts`, `src/app/app.css`, `tests/app/quick-settings.test.ts`.

## Kiểm

- `pnpm check` xanh: `verify-kit` 95 file khớp manifest, 77 file test, 707 test qua và 1 bỏ qua (trước 703), `tsc` và
  build.
- Test mới hoặc viết lại trong `tests/app/quick-settings.test.ts`: lớp phần đầy và ảnh của hai lớp, mọi hàng trượt có
  rãnh, phần đầy, cột Mute; `--kit-qs-v` theo giá trị 0/50/100; biến của lớp (núm, cắt rãnh, cột, bộ lọc); bảng Sound
  640 px; tấm nút (cắt, cỡ, outset tính từ `PLATE_SLICE`/`PLATE_MARGIN`), tấm đang bật, rê chuột; số đo cắt của ảnh
  162; tấm danh sách (ảnh, cắt, `LIST_ROW_VARS`, khe 2 px tính lại từ lề), dòng chọn, danh sách theo tỉ lệ; icon từng
  hàng, ô Quality trống, mọi URL icon là file có thật; font tựa. Thử đột biến (bỏ `sliderEmpty`, bỏ `LIST_ROW_VARS`):
  2 test đỏ, đã trả lại.
- Host chơi (`pnpm build:dragon` ở repo cha, https://dragon.typing-game.local/), Chrome không giao diện, 1280 × 720 và
  1920 × 1080, ở màn tựa và trong trận, mở F1 và F2:
  - không ảnh hỏng, 0 yêu cầu lỗi (317 yêu cầu), 0 ngoại lệ. Ba cảnh báo "title: missing art" có từ trước (ảnh màn tựa
    197 chưa được nhận), không do lượt này;
  - phần đầy đo bằng điểm ảnh, núm ẩn: 720p 16 / 94 / 172 px, tính ra 16 / 93,8 / 171,5; 1080p 24 / 141 / 258, tính ra
    24 / 140,6 / 257,3;
  - sáu rãnh dài bằng nhau: 187,5 px ở 720p, 281,3 px ở 1080p, cả màn tựa và trong trận;
  - nút và chip cao 32 px (48 px ở 1080p); 36 dòng danh sách trên `button.alpha.png`, dòng chọn trên
    `button-active.alpha.png`, chữ vàng; dòng 34 px (51 px ở 1080p);
  - bảng Sound vừa khung: `scrollHeight` bằng `clientHeight` ở 720, 900 và 1080 (596, 745, 894 px);
  - bàn phím: Tab đi Close, Master, Mute, Music, Effects, dòng đang chọn, các nút nghe thử, không ra khỏi bảng; mũi tên
    phải trên Music 60 → 61 và phần đầy theo; focus trên Mute và dòng danh sách là quầng vàng, không còn viền 2 px; Esc
    đóng bảng ở màn tựa và trong trận; đóng bảng trong trận thì hiện đếm ngược 3-2-1;
  - âm phím: chọn bộ Deep Amber trong bảng, đóng, chờ đếm ngược, gõ một chữ: `stats.played` 0 → 1, đúng một tiếng.
- Tờ ghép: `dragonhold-1280x720.jpg` và `dragonhold-1920x1080.jpg` ở thư mục kiểm của lượt (ngoài repo); số đo trong
  `tmp/kit-qs-games/numbers.json`. Ảnh thô đã xoá bằng `tools/capture-prune/prune.mjs`.

## Còn mở

- Close vẫn là nút chữ trên tấm nút: chưa có ảnh Close được nhận (245).
- Phần đầy và rãnh rỗng chờ ảnh 244; tấm hàng danh sách chờ 245 (tấm nút có viền mảnh hơn một tấm hàng thật).
- Hàng Quality chưa có icon (chưa có icon đồ hoạ nào được nhận).
- Chưa thử Firefox; các luật `::-moz-range-*` chỉ kiểm bằng đọc CSS. `:has()` cần Firefox 121 trở lên (chỉ để làm ấm
  rãnh khi focus).
- Con trỏ submodule ở repo cha chưa cập nhật.
