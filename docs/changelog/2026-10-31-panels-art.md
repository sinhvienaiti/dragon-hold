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
