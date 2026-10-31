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
- Phần đầy và rãnh rỗng chờ ảnh 244 (đã gắn ở lượt sửa bên dưới); tấm hàng danh sách chờ 245 (tấm nút có viền mảnh hơn một tấm hàng thật).
- Hàng Quality chưa có icon (chưa có icon đồ hoạ nào được nhận).
- Chưa thử Firefox; các luật `::-moz-range-*` chỉ kiểm bằng đọc CSS. `:has()` cần Firefox 121 trở lên (chỉ để làm ấm
  rãnh khi focus).
- Con trỏ submodule ở repo cha chưa cập nhật.

## Lượt sửa (giám khảo 31/10, tối)

Giám khảo chấm lượt da ở trên và ghi 11 mục cho hai game; kit sửa ở repo cha `b8a224d0` (xem changelog kit ở repo cha),
đồng bộ lại vào `src/kit` (`verify-kit` OK, 95 file). Mục và cách sửa ở Dragonhold:

| # | Giám khảo thấy | Đã sửa |
|---|---|---|
| 1 | Núm bị rãnh và phần đầy vẽ đè lên khi không rê chuột, không focus | Kit: núm `z-index` 1 trên hai lớp ảnh (0). Đo ở tâm núm tại 0/50/100: ảnh giống hệt khi ẩn hai lớp (sai khác 0), khác hẳn khi ẩn núm |
| 2 | Khung có mảng đá vuông lặp ("round") dọc cột trái và dưới nhãn Keyboard sound | `::before` của bảng phủ một bản đá giữa duy nhất lên dải đá trong của các cạnh, chừa bốn góc 83 px giữ vuốt. Không cắt lại ở dải 104 như gợi ý: vuốt góc dài tới 290 px dọc dải và 190 px vào trong, cắt ở 104 thì vuốt rơi vào cạnh lặp. Bản đá giữ ảnh vuông, co theo bề rộng (phần giữa 630 px phủ hộp), không ép từng trục: ép trục dọc trên bảng Settings ngắn làm dải vàng của khung hiện thành hai vạch ngang. Dải dưới của ảnh dày hơn 25 px, nên phần phủ dừng cách đáy 10 px, giữ mép vàng |
| 4 | Settings ở màn tựa có Resume và Quit to title | `context: () => (run ? "play" : "title")`: không có trận thì hai nút ẩn; trong trận và sau Quit to title đúng như mong đợi |
| 5–6 | Danh sách cắt cứng, dòng chọn ở mép dưới; Tab đi qua 34 nút nghe thử | Kit: mép mờ, bám dòng, dòng chọn ra giữa khi mở; chỉ một nút Listen trong thứ tự Tab. Đo: Tab từ dòng chọn tới Keyboard volume sau 2 lần |
| 7 | Rê chuột trên dòng danh sách không thấy | `--kit-qs-list-hover-filter`: sáng 1,3 kèm quầng than hồng 6 px (giống nút) |
| 9 | Phần đầy và phần rỗng là lọc màu trên rãnh cũ | `QUICK_SKIN.sliderFill` = phần đầy 244 (nhận 31/10), rãnh rỗng là rãnh 241; bỏ hai bộ lọc giả, hai lớp vẽ đúng như ảnh, cùng cắt `0 64`. Focus bàn phím chỉ thêm quầng |
| 11 | Chữ thân là sans web | `--kit-qs-button-font` và `--kit-qs-label-font` là Cormorant Garamond 700 (nhãn 19 px, nút, chip, dòng danh sách 18 px, tiêu đề mục 16 px ở 720p); số và ghi chú giữ Be Vietnam Pro (`--kit-qs-note-font`) |

Mục 3, 8, 10 là của Wordwoven.

Kiểm:

- `pnpm check`: kit OK, 77 file test, **710 test qua, 1 bỏ qua** (trước 707), build OK. Test mới: khung đá một bản
  (`::before`, mask, nền vuông), font và rê chuột danh sách, Settings ở màn tựa ẩn Resume và Quit to title còn trong trận
  thì hiện; hai test thanh trượt đổi sang ảnh 244.
- Host chơi (`pnpm build:dragon` ở repo cha; `?debug=1&wpm=35&prelearn=0` để vào trận và đọc số), Chrome không giao diện,
  1280 × 720 và 1920 × 1080:
  - 0 ảnh hỏng, 0 yêu cầu lỗi, 0 ngoại lệ; ba cảnh báo "title: missing art" có từ trước;
  - núm trên lớp ảnh ở 0/50/100, cả màn tựa và trong trận;
  - phần đầy 244 dừng ở tâm núm: 720p 16 / 94 / 172 px (tính ra 16 / 93,8 / 171,5), 1080p 24 / 141 / 258
    (24 / 140,6 / 257,3);
  - Settings ở màn tựa: Resume và Quit to title ẩn; trong trận: hiện; tick đứng khi bảng mở (127 → 127), đóng thì đếm
    3-2-1 rồi chạy tiếp;
  - danh sách: mép mờ trên và dưới, bám dòng (`scroll-snap-type: y`), dòng chọn cách tâm 11 px (720p), 16,5 px (1080p);
  - Tab: từ dòng chọn qua nút Listen của nó tới Keyboard volume; 12 lần Tab vẫn trong bảng; Esc đóng ở màn tựa và trong
    trận;
  - sáu hàng trượt cao bằng nhau (42 px ở 720p, 63 px ở 1080p); bảng Sound không cuộn (596 / 596 px ở 720p);
  - chọn Deep Amber, đóng, gõ một chữ: đúng một tiếng (`stats.played` 0 → 1);
  - khung ở 1:1: không còn mảng vuông ở cột trái và mép trên; không còn vạch vàng trên bảng Settings ngắn; mép vàng dưới
    liền.
- Tờ ghép `fix-dragonhold-1280x720.jpg`, `fix-dragonhold-1920x1080.jpg` (thư mục kiểm của lượt, ngoài repo); số đo trong
  `tmp/kit-qs-fix/numbers.json`. Ảnh thô đã xoá bằng `tools/capture-prune/prune.mjs`.

Còn mở sau lượt sửa:

- Close vẫn là nút chữ; tấm hàng danh sách vẫn là tấm nút 162: chờ ảnh 245.
- Ở 1:1 vẫn thấy rất nhẹ ranh giới vân đá ở mép bốn ô góc 83 px (ô góc vẽ ở tỉ lệ 0,4, phần giữa ở khoảng 0,76–0,88).
- Icon 244 của bảng Sound (8 icon) đã nhận nhưng chưa gắn: không nằm trong mục giám khảo; Keyboard volume vẫn dùng
  `vol-keyboard`.
