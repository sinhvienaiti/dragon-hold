# 31/10/2026 · Dragonhold · Bảng Sound: icon 244 và phần đầy 244 đã nhận

Nhánh `main`, sau `0ca70a8`. Gắn ảnh phiếu 244 mà điều phối đã nhận ngày 31/10 (chấm ở cỡ thật, 8–8,5). Không sửa
`src/kit` (kit đã đồng bộ ở repo cha `b8a224d0`, `verify-kit` OK), không sửa `shared/game-kit`, không gắn ảnh nào của
phiếu 245–249 (tấm hàng danh sách, nút Close, bóng quái, phần HUD, icon r3, súng).

## Ảnh

Chép nguyên byte từ `art-src/ui/quick-settings/` sang `public/assets/dragon-hold/ui/quick-settings/` (ngoài Git, như các
ảnh bảng đã có), md5 khớp nguồn:

| Hàng / phần | Tệp trong `public` | Nguồn |
|---|---|---|
| Keyboard sound | `vol-keyboard.r2.64.png` | `selected/vol-keyboard.r2.64.png` |
| Keyboard volume (mới) | `vol-keyboard-volume.64.png` | `selected/vol-keyboard-volume.64.png` |
| Voice | `vol-voice.r2.64.png` | `selected/vol-voice.r2.64.png` |
| Interface | `vol-interface.r2.64.png` | `selected/vol-interface.r2.64.png` |
| Phần đầy, bản 512 | `slider-fill.512.png` | `sliders/slider-fill.512.png` |

- Các icon khác giữ đúng bản đang dùng: bộ `selected/` cỡ 64 của phiếu 180 (Master, Music, Effects, hai nút góc và loa
  tắt tiếng). Icon r2 mang tên riêng trong `public`, không đè tệp cũ, nên trình duyệt không dùng nhầm bản cũ trong cache.
- Thanh trượt: `sliderFill` là phần đầy than hồng 244 (`slider-fill.png`, 1024 × 64), `sliderEmpty` là rãnh 241
  (`slider-track.png`); hai lớp cùng cắt `0 64`, đầu rãnh khớp từng điểm ảnh. Việc này đã xong ở `0ca70a8` (bộ lọc giả
  phần đầy và phần rỗng xám đã bỏ ở đó); lượt này chỉ chép thêm bản 512 cho đủ bộ và đo lại trên host chơi: hai lớp
  không có `filter` nào khi không focus. Bộ lọc còn lại trên thanh trượt đều là trạng thái trên ảnh thật: quầng vàng khi
  focus bàn phím, hàng Master tối và xám khi tắt tiếng.
- `media.md5` chưa có dòng cho năm tệp mới (cũng như các ảnh thanh trượt và `button-active` của các lượt trước): điều phối
  thêm dòng khi đẩy media.

## Mã

- `src/app/quick.ts`: bảng `QUICK_ICON_FILES` (tên icon của kit → tên tệp trong `public`): bộ 180, ba bản r2 cho
  `vol-keyboard`, `vol-voice`, `vol-interface`, và `vol-keyboard-volume` cho hàng Keyboard volume (tên icon hàng của kit).
  `QUICK_ICONS` dựng từ bảng đó. Hàng Keyboard volume không còn mượn icon bàn phím.
- Không đổi CSS: ô icon vẫn 24 px nhân `--kit-qs-s` (24 px ở 720p, 36 px ở 1080p).

## Kiểm

- `pnpm check` xanh: `verify-kit` 95 file khớp manifest, 77 file test, **711 test qua, 1 bỏ qua** (trước 710), `tsc` và
  build.
- `tests/app/quick-settings.test.ts`:
  - viết lại test icon: mỗi hàng bảng Sound đúng tệp (r2 cho Keyboard sound, Voice, Interface; icon riêng cho Keyboard
    volume), bảy hàng bảy ảnh khác nhau, mọi URL lấy từ `QUICK_ICON_FILES`, nút góc giữ bộ 180, ô Quality vẫn trống;
  - test mới (chỉ chạy khi máy có media và `art-src`, vì cả hai ngoài Git): mỗi icon trong `public` là bản sao nguyên
    byte của nguồn đã nhận, phần đầy và rãnh cũng vậy;
  - thử đột biến: trả Voice về icon cũ thì test icon đỏ; đổi tên tệp Keyboard volume thì cả hai test đỏ; đã trả lại.
- Host chơi (`pnpm build:dragon` ở repo cha, https://dragon.typing-game.local/?debug=1&wpm=35&prelearn=0), Chrome không
  giao diện, 1280 × 720 và 1920 × 1080, F1 và F2 ở màn tựa và trong trận:
  - 0 ảnh hỏng, 0 yêu cầu lỗi (319 và 314 yêu cầu), 0 ngoại lệ; ba cảnh báo "title: missing art" có từ trước (ảnh màn
    tựa 197 chưa nhận);
  - bảy icon hàng đều tải (200, ảnh 64 × 64, vẽ 24 px ở 720p, 36 px ở 1080p), đúng tệp từng hàng; ô Quality trống như
    trước;
  - phần đầy 244 dừng ở tâm núm, đo bằng điểm ảnh (núm ẩn): 720p 16 / 94 / 172 px, tính ra 16 / 93,8 / 171,5; 1080p
    24 / 141 / 258, tính ra 24 / 140,6 / 257,3; giống nhau ở màn tựa và trong trận;
  - sáu rãnh dài bằng nhau: 187,5 px ở 720p, 281,3 px ở 1080p; bảng Sound không cuộn (596 / 596 và 894 / 894 px);
  - Settings ở màn tựa ẩn Resume và Quit to title, trong trận thì hiện; tick đứng khi bảng mở;
  - bàn phím: 14 lần Tab từ Close đều ở trong bảng; mũi tên phải trên Music 60 → 61 và `--kit-qs-v` theo; Esc đóng bảng
    ở màn tựa và trong trận;
  - âm phím: chọn Deep Amber, đóng, chờ đếm ngược, gõ một chữ: đúng một tiếng (`stats.played` 0 → 1), trận chạy tiếp.
- Tờ ghép `dragonhold-1280x720.jpg`, `dragonhold-1920x1080.jpg` (thư mục kiểm của lượt, ngoài repo): hai bảng ở màn tựa
  và trong trận, cột icon ở 1:1 và 2×, phần đầy ở 0/50/100. Số đo trong `tmp/panels-art/numbers.json`. Ảnh thô đã xoá
  bằng `tools/capture-prune/prune.mjs`.

## Còn mở

- Close vẫn là nút chữ, dòng danh sách vẫn là tấm nút 162: chờ ảnh 245 được nhận.
- Hàng Quality chưa có icon (`gfx-quality` chưa có ảnh được nhận).
- Icon vẽ từ bản 64: ở 1080p trên màn 2× ô 36 px cần 72 px nên hơi mềm, như mọi icon bảng khác. Nếu cần nét hơn, đổi
  cả bộ sang bản 128 trong một lượt (không làm riêng bốn icon này để giữ cả cột cùng độ nét).
- `media.md5` thiếu dòng cho các ảnh bảng mới (xem trên).
- Chưa thử Firefox.
- Con trỏ submodule ở repo cha chưa cập nhật.

## Lượt sửa theo giám khảo (tối 31/10)

Sau `43ac4e4`. Kit đồng bộ lên repo cha `fc7f4a11` (gồm `ba2b4d65`: Tab đi vòng trong bảng; `fc7f4a11`: hàng Master tắt
tiếng trong kit, phản hồi nút Listen, thanh cuộn mảnh của danh sách). Lượt này không sửa `shared/game-kit`. Không gắn ảnh
nào của phiếu 245–249.

### Đã sửa

| Mục giám khảo | Sửa |
|---|---|
| Tab rời bảng Settings ở màn tựa (Close → High → BODY) | Kit `ba2b4d65` giữ Tab trong bảng; thêm vào đó bảng Settings giờ kết thúc bằng công tắc Pronunciation, không phải nhóm radio. Test mới: ở màn tựa 10 Tab và 10 Shift+Tab từ khung hộp thoại đều ở trong cả hai bảng. |
| Shift+Tab từ khung hộp thoại không làm gì | Kit `ba2b4d65`: tới điều khiển cuối. |
| Icon hàng 24 px | `--kit-qs-icon-size` 32 px nhân `--kit-qs-s` (32 px ở 720p, 48 px ở 1080p), cột đầu lưới theo đó. Đặt ở lớp của game, không đổi mặc định kit (các game khác tự chọn). |
| Icon và hai nút góc từ tệp 64 px | Mọi icon bảng, hai nút góc và loa tắt tiếng dùng bản 128 (`ICON_PX`), chép nguyên byte từ `art-src/ui/quick-settings/selected/` vào `public/` (ngoài Git); test chép nguyên byte kiểm bản 128. |
| Bảng Settings chỉ có Quality | Thêm **Graphics**: Reduced motion (công tắc), Quality; **Learning**: Vietnamese meaning, Pronunciation. Cả ba công tắc đều thật (xem dưới), lưu vào save. Hàng Typing effects (kiểu chữ, cường độ, cỡ) chưa thêm: Dragonhold chưa có dải chữ của kit, hiệu ứng chữ riêng của game không có ba tuỳ chọn đó, nên hàng sẽ là điều khiển giả. |
| Số trên thanh trượt và số đếm ngược là Be Vietnam Pro | Cormorant 700, `lining-nums tabular-nums`. |
| Đếm ngược là chữ hệ thống trắng | Số vàng `#f2c14e` Cormorant 132 px (720p) viền tối, đặt cao (24vh), cả màn tối đi một lớp mờ hình elip trong lúc đếm. Huy chương nền chưa có: chưa có ảnh được nhận, nên chưa thêm trường skin trong kit. |
| Khoảng trống dưới nhãn Keyboard sound | Danh sách bắt đầu dưới nhãn và trải qua cột nhãn và cột điều khiển (rộng 554 px ở 720p, trước 330). |
| Rãnh trượt 187,5 px | Bảng Sound 720 px, cột nhãn riêng của bảng Sound; rãnh 260 px ở 720p (trước 187,5), 390 px ở 1080p, sáu rãnh bằng nhau. |
| Nút Listen không phản hồi | Kit `fc7f4a11`: sáng và quầng khi trỏ chuột, nhấn thu nhỏ, sáng suốt lúc mẫu đang phát (`is-playing`), cỡ theo `--kit-qs-s`; quầng vàng than hồng của game. |
| Thanh cuộn danh sách là thanh xám hệ điều hành | Kit `fc7f4a11` vẽ thanh mảnh; game đặt `--kit-qs-scroll-thumb` vàng than hồng trên nền trong. |

### Ba công tắc Settings

- **Reduced motion**: tắt rung màn hình (camera `configure({ reducedMotion })`, trauma dừng) và lớp `dh-still` trên
  overlay làm đứng mọi hoạt ảnh nhấp nháy, bay mà luật `prefers-reduced-motion` của game đã dừng (HUD, thẻ chữ, tia chữ,
  màn thắng, cảnh báo máu thấp); đếm ngược của kit cũng đứng (`kit-qs--still`). Save chưa có giá trị thì theo
  `prefers-reduced-motion` của hệ thống.
- **Vietnamese meaning**: tắt thì thẻ chữ không có dòng nghĩa và khung học không hiện nghĩa; dòng "Learned:" chỉ còn từ.
  Có hiệu lực ngay. Học trước và Thẻ Ôn vẫn hiện nghĩa (đó là bài học).
- **Pronunciation**: tắt thì khung học không hiện IPA.
- Ba hàng mới mang tên icon của kit (`gfx-motion`, `gfx-quality`, `learn-meaning`, `learn-ipa`) nhưng chưa có ảnh được
  nhận: ô icon để trống, giữ bề rộng. Cần thêm bốn icon này vào phiếu ảnh.

### Kiểm

- `pnpm check` xanh: `verify-kit` 96 file khớp manifest (kit `fc7f4a11`), 77 file test, **715 test qua, 1 bỏ qua**
  (trước 711). Test mới hoặc viết lại:
  - Reduced motion: tới camera (`configure`), lớp `dh-still`, `kit-qs--still`, lưu vào save; save chưa có thì theo hệ
    thống; mỗi luật `prefers-reduced-motion` của game có bản `.dh-still`;
  - hai công tắc Learning: nghĩa và IPA tắt ngay ở thẻ chữ và khung học, lưu vào save;
  - màn tựa: bảng Settings kết thúc bằng công tắc; 10 Tab và 10 Shift+Tab từ khung hộp thoại đều ở trong cả hai bảng;
  - Tab trên danh sách bàn phím giờ thuộc kit (sang nút Listen của hàng, rồi Keyboard volume);
  - icon bản 128 vẽ 32 px, ô Graphics và Learning để trống; test chép nguyên byte kiểm bản 128;
  - CSS: số và đếm ngược bằng Cormorant, lớp mờ khi đếm, danh sách trải hai cột, bảng Sound 720 px, cột nhãn 138 px,
    danh sách 218 px, thanh cuộn vàng.
  - Lần chạy đầu một test thời gian (`tags-bodies`, xếp 20 thẻ dưới 1 ms) đỏ khi máy tải 14–15 (các lượt khác chạy cùng
    lúc); chạy riêng xanh, chạy lại cả bộ xanh. Lượt này không đổi logic thẻ (chỉ thêm hai dòng CSS `.dh-still`).
- `pnpm build:dragon` ở repo cha, Chrome không giao diện trên https://dragon.typing-game.local/?debug=1&wpm=35&prelearn=0,
  1280 × 720 và 1920 × 1080, F1 và F2 ở màn tựa và trong trận:
  - 0 ảnh hỏng, 0 yêu cầu lỗi (320 yêu cầu mỗi cỡ), 0 ngoại lệ; ba cảnh báo "title: missing art" có từ trước;
  - bảy icon hàng Sound tải bản 128 (200, 128 × 128), vẽ 32 px ở 720p và 48 px ở 1080p;
  - phần đầy dừng ở tâm núm, đo bằng điểm ảnh: 720p 16 / 130 / 244 px đúng như tính; 1080p 24 / 195 / 366 px đúng như
    tính; giống nhau ở màn tựa và trong trận;
  - sáu rãnh bằng nhau: 260 px ở 720p, 390 px ở 1080p; bảng Sound không cuộn (598 / 598 và 897 / 897 px), bảng Settings
    cũng không (311 / 311 ở màn tựa, 359 / 359 trong trận ở 720p); bốn chip Quality một dòng;
  - danh sách Keyboard sound bắt đầu dưới nhãn, rộng 554 px (720p) và 831 px (1080p);
  - bàn phím: 10 Tab và 10 Shift+Tab từ khung hộp thoại ở màn tựa đều trong bảng, cả Settings và Sound (Close →
    Reduced motion → High → Vietnamese meaning → Pronunciation → Close); mũi tên phải trên Music 60 → 61; Esc đóng bảng
    ở màn tựa và trong trận; tick đứng khi bảng mở;
  - Reduced motion bật thì overlay có `dh-still`, tắt thì bỏ;
  - Listen: trỏ chuột sáng và có quầng vàng, bấm thì `is-playing` trong lúc mẫu phát, hết mẫu thì tắt;
  - đếm ngược: "3" Cormorant 132 px (198 px ở 1080p) màu `#f2c14e` trên lớp mờ;
  - âm phím: chọn Deep Amber, đóng, chờ đếm ngược, gõ một chữ: đúng một tiếng (`stats.played` 0 → 1), trận chạy tiếp.
- Tờ ghép `dragonhold-1280x720.jpg`, `dragonhold-1920x1080.jpg` (thư mục kiểm của lượt, ngoài repo). Số đo trong
  `tmp/panels-fix/numbers.json`; ảnh thô đã xoá bằng `tools/capture-prune/prune.mjs`.

### Còn mở

- Typing effects (kiểu chữ, cường độ, cỡ, ô xem thử) chờ dải chữ của kit vào Dragonhold.
- Bốn icon `gfx-motion`, `gfx-quality`, `learn-meaning`, `learn-ipa` chưa có ảnh: cần phiếu ảnh.
- Huy chương nền cho số đếm ngược chưa có ảnh; trường skin trong kit chỉ nên thêm khi có ảnh.
- Mặc định `--kit-qs-icon-size` của kit vẫn 24 px; Dragonhold đặt 32 ở lớp của game.
- `watchMute` của game vẫn chạy song song với hàng Master tắt tiếng mới của kit (`fc7f4a11`): cùng kết quả (mờ, gạch số,
  "Unmute", loa tắt tiếng); gỡ ở lượt sau.
- `media.md5` chưa có dòng cho mười icon 128 mới trong `public/` (điều phối thêm khi đẩy media).
- Close vẫn là nút chữ, dòng danh sách vẫn là tấm 162 (chờ ảnh 245). Chưa thử Firefox. Con trỏ submodule ở repo cha chưa
  cập nhật.
