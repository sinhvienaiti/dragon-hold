# 30/10/2026 · Tiếng phím: bộ thứ 34, Hail Stone

Chủ dự án chọn thêm bộ Hail Stone (bản v4 của Firefly: mưa đá nhỏ rơi trên tảng đá dày, xử lý tự nhiên như Raindrop Tile) cho mọi game. Dragonhold giờ có 34 bộ Firefly. Làm theo đúng cách của Raindrop Tile (`a88815e`, rà soát `72717f1`).

## Đã làm

- `public/assets/dragon-hold/audio/keys/hail-stone/`: chép nguyên từ `~/AudioLab/review/staging/keys-firefly/hail-stone/`: 25 phím, 8 phím cách, `preview.ogg` 1 giây và `keys-manifest.json` (schema `typing-keys-firefly/2`, `files: [{file, set, durationMs}]`, `preview`). OGG Vorbis stereo 48 kHz; phím 90–450 ms, phím cách 331–535 ms (theo manifest); cả bộ 322.790 byte (34 OGG và manifest; `du` báo 380 KB vì làm tròn theo khối đĩa).
- Danh mục gốc `keys-manifest.json` chép nguyên từ staging (34 mục; bản 33 mục nằm ở `keys-manifest.33-sets.bak.json` trong staging, giống từng byte bản trong repo trước lần này). Hail Stone thuộc họ Solid, `order` 12, ngay sau Solid Amber; các bộ sau lùi một (Crisp Velvet là 13, Raindrop Tile 19 … Bright Clack Ember 33). Mục này có `score: null` và `ownerPick: true` như Raindrop Tile. Solid giờ có 3 bộ, Crisp vẫn 7.
- `media.md5`: thêm 34 dòng OGG theo thứ tự đường dẫn như cũ (dòng tiếng phím từ 2.710 lên 2.744, cả file từ 4.779 lên 4.813 dòng); không dòng nào khác đổi. `hail-stone/keys-manifest.json` nằm trong Git, OGG vẫn bị bỏ qua.
- Mặc định vẫn là `bright-clack`. Mã game và kit không đổi.

## Test (viết trước, đỏ trước khi chép media)

- `tests/app/settings-and-keyboard.test.ts`:
  - 34 bộ, 7 họ liền mạch, số bộ mỗi họ: Deep 3, Warm 6, Rounded 1, Solid 3, Crisp 7, Clear 4, Bright Clack 10. Hail Stone đứng giữa Solid Amber và Crisp Velvet; mục danh mục có `score: null`, `ownerPick: true`, `order: 12`; Raindrop Tile giờ `order: 19`; `order` chạy liền 0–33; hai bộ duy nhất không có điểm là `hail-stone` và `raindrop-tile`.
  - Hail Stone có 25 phím, Raindrop Tile 17, các bộ khác 70–80; tổng 2.438 phím và 272 phím cách.
  - `media.md5` liệt kê đúng 2.744 OGG dưới `audio/keys`, khớp mã băm.
  - Test đuôi dài giờ chạy cho cả hai bộ chủ dự án chọn (`it.each`): phím dài nhất 450 ms, phím cách dài nhất 535 ms; nạp đủ 33 mẫu (Hail Stone) và 25 mẫu (Raindrop Tile); trong 4 giây, một phím mỗi 100 ms và một phím cách mỗi 500 ms xen giữa: 48 lần phát, trong đó 40 phím và 8 phím cách, không giọng nào bị lấy, không mẫu nào bị dừng sớm.
- `tests/app/quick-settings.test.ts`: 36 lựa chọn (Off, Dragonhold, 34 bộ); Hail Stone nằm cuối họ Solid, trước Crisp Velvet; chuyển qua Hail Stone trong bảng Sound vẫn chỉ giữ một bộ đã giải mã.
- Trước khi chép media: 6 test đỏ (34 bộ, 36 lựa chọn, đổi bộ qua Hail Stone, tổng phím, 2.744 dòng `media.md5`, đuôi dài của Hail Stone). Sau khi chép: xanh.

## Lỗi nhỏ từ rà soát Raindrop: chữ "10 phím và 2 phím cách mỗi giây"

Bản đầu (`a88815e`) gọi test là 10 phím và 2 phím cách mỗi giây nhưng vòng lặp phát 8 phím và 2 phím cách mỗi giây. Rà soát `72717f1` đã sửa vòng lặp cho đúng tên: 40 phím cách nhau 100 ms và 8 phím cách cách nhau 500 ms trong 4 giây, tức đúng 10 phím và 2 phím cách mỗi giây; changelog bộ 33 cũng ghi như thế. Vì vậy chữ và vòng lặp hiện đã khớp, không đổi chữ thành "8 phím". Lần này ghi rõ số trong chú thích của test và kiểm riêng 40 lần phát phím (trước chỉ kiểm tổng 48 và 8 phím cách), nên ai đổi vòng lặp mà không đổi tên test thì test đỏ.

## Đo mẫu (ffprobe, ffmpeg)

- Cả 34 OGG là Vorbis 48 kHz, 2 kênh; `preview.ogg` 1,000 giây như 33 bộ kia; độ dài trong manifest là độ dài `ffprobe` làm tròn tới mili giây.
- Kết thúc mẫu: mẫu cuối của mọi phím và phím cách ở −82,8 dBFS trở xuống, 1 ms cuối ở −66 dBFS trở xuống, nên chỗ kết thúc không tách. 10 ms cuối của `key-06` (−40,6 dBFS) và `space-03` (−35,1 dBFS) to hơn ở Raindrop Tile (−83 dBFS trở xuống): đuôi được cắt bằng một đoạn mờ vài mili giây.
- **`preview.ogg` kết thúc ở −51 dBFS** (1 ms cuối đỉnh −44,8 dBFS), trong khi bản nghe thử của 33 bộ kia kết thúc ở im lặng hoặc −83 dBFS trở xuống. Kit dừng bản nghe thử đúng 1 giây và không mờ (`source.stop(start + 1)`), nên cuối bản nghe thử có thể có tiếng tách rất nhỏ. Không sửa ở đây vì media lấy nguyên từ staging; cách sửa: mờ 10 ms cuối `preview.ogg` trong staging rồi chép lại.
- **Tiếng gõ chính đến muộn ở 7 trên 25 phím.** Mẫu mưa đá có nhiều viên rơi: ở 7/25 phím, 20 ms đầu nhỏ hơn tiếng to nhất của chính mẫu ấy hơn 12 dB, và tiếng to (tới −6 dB so với đỉnh, RMS 5 ms) đến sau khi bấm `key-20` 35 ms, `key-23` 40 ms, `key-12` 65 ms, `key-04` 95 ms, `key-06` 125 ms, `key-16` 135 ms, `key-25` 205 ms. Thêm 4 phím có tiếng đầu nhỏ rồi một tiếng to hơn sau 25–75 ms (`key-19`, `key-07`, `key-22`, `key-05`). Phím cách: `space-05` 50 ms, `space-03` 150 ms, `space-07` 160 ms, `space-06` 245 ms; `space-08` có tiếng đầu nhỏ rồi tiếng to sau 90 ms. Ở Raindrop Tile và Solid Amber, mọi phím đạt −6 dB so với đỉnh trong 10 ms đầu. Đây là bản chủ dự án chọn (xử lý tự nhiên), nên không đổi media trong game; chủ dự án cần nghe và quyết: giữ, cắt phần đầu trong staging cho tiếng chính rơi vào 0–10 ms, hay bỏ các mẫu ấy.

## Giọng

- Như Raindrop Tile: phím dài nhất 450 ms (464 ms khi cao độ hạ 3 %), 6 giọng phím đủ cho khoảng 13 phím mỗi giây mà không cắt; ở 10 phím mỗi giây có nhiều nhất 5 giọng cùng kêu. Phím cách 535 ms, 2 giọng đủ cho một phím cách mỗi 0,28 giây.
- Mô phỏng (cùng một mô hình cho cả hai bộ, nên số không so được với số của rà soát Raindrop): 4.000 từ 4–8 chữ, WPM tính 5 chữ một từ, khoảng cách trong từ bằng 75 % trung bình ±30 %, cao độ ±3 % như kit, 6 giọng, mỗi tốc độ khoảng 23.900 phím. Hail Stone: 80 và 100 WPM không cắt; 120 WPM 8 lần (0,3 trên 1.000 phím; giọng bị cắt đã 397 ms tuổi trở lên và dưới đỉnh của nó ít nhất 25,7 dB); 150 WPM 44 lần (1,8 trên 1.000; 306 ms tuổi trở lên, to nhất −7,6 dB); 180 WPM 143 lần (6,0 trên 1.000; 253 ms tuổi trở lên, có lần cắt đúng tiếng to nhất). Raindrop Tile cùng mô hình: 120 WPM 3,9, 150 WPM 20,7, 180 WPM 69,0 trên 1.000, mọi lần cắt đều dưới đỉnh ít nhất 48,8 dB.
- Hail Stone bị cắt ít hơn vì nhiều phím ngắn, nhưng vì tiếng to có thể đến muộn nên ở 150–180 WPM một lần cắt có thể nghe được (mờ 4 ms). Không tăng số giọng; nếu chủ dự án muốn, game truyền `keyVoices` cho `new TypingSounds(...)` trong `src/app/keyboard.ts`, không phải sửa kit.

## Kiểm

`pnpm check` đạt: kit 95/95 file, 58 file test, 520 test (thêm một ca đuôi dài cho Hail Stone), TypeScript và Vite build. Bốn ván vàng giữ nguyên (`src/sim`, `src/typing`, `src/content`, `tests/golden` không đổi).

Trình duyệt (trình duyệt có sẵn của app, `dh-keys-dev` cổng 4149, cỡ desktop 1024×768), bảng Sound mở bằng nút loa:

- Danh sách "Keyboard sound" có 36 lựa chọn (Off, Dragonhold và 34 bộ), 7 tiêu đề họ; Hail Stone nằm dưới tiêu đề Solid, ngay sau Solid Amber, trước tiêu đề Crisp và Crisp Velvet.
- Rê chuột lên Hail Stone khoảng 1 giây: tải đúng `hail-stone/preview.ogg`.
- Chọn Hail Stone: tải `hail-stone/keys-manifest.json`, 25 phím và 8 phím cách (34 tệp, không bộ nào khác); lựa chọn được đánh dấu và lưu (`dragon-hold:settings:v1` có `keyboard: "hail-stone"`), tải lại trang vẫn giữ.
- Sau khi tải lại, gõ phím ở thẻ từ mới (chữ, phím cách, Enter): bộ Hail Stone được tải lại đủ 34 tệp, đều 200; console không có lỗi.
- Ảnh chụp: `tmp/hail-stone-check/sound-panel-solid.jpg` (không vào Git).

## Rà soát (Claude, 30/10 tối)

Kiểm lại `10bf889` với file thật, không chỉ đọc mã:

- Media: `diff -r` thư mục `hail-stone/` và `cmp` danh mục gốc với staging: giống từng byte; danh mục trước lần này giống từng byte `keys-manifest.33-sets.bak.json` trong staging. 34 dòng `media.md5` đúng bằng 34 OGG trong `hail-stone/` và khớp `md5` từng tệp; không dòng cũ nào đổi hay mất; 2.744 dòng tiếng phím, 4.813 dòng cả file, vẫn xếp theo đường dẫn. OGG bị `.gitignore` bỏ qua, chỉ `hail-stone/keys-manifest.json` nằm trong Git; không tệp âm thanh nào được theo dõi.
- `ffprobe`: cả 34 OGG là Vorbis 48 kHz, 2 kênh; độ dài khớp `durationMs` tới mili giây (phím 90–450 ms, phím cách 331–535 ms); `preview.ogg` 1,000 giây. Cả bộ 322.790 byte. Số đo đuôi và tiếng chính đến muộn ở trên đo lại đúng từng số (`key-06` mẫu cuối −82,8 dBFS, 10 ms cuối −40,6; `space-03` 1 ms cuối −66,4, 10 ms cuối −35,1; `preview.ogg` mẫu cuối −51,2, 1 ms cuối −44,8; tiếng to đến sau `key-20` 35 ms … `key-25` 205 ms, `space-06` 245 ms).
- Danh mục và mã: 34 mục, `order` 0–33 liền nhau; `loadKeyboardCatalog` chỉ giữ `score` khi là số hữu hạn nên `score: null` không chặn bộ; `note` không vào giao diện; bộ đủ ngưỡng "ready" của kit (ít nhất 10 phím, 3 phím cách). Mặc định vẫn `bright-clack`.
- Giọng, kiểm chéo bằng một mô hình gõ khác (6 giọng, lấy giọng cũ nhất như `VoicePool`, mức đường bao RMS 10 ms so với đỉnh của chính mẫu, khoảng 24.000 phím mỗi tốc độ): Hail Stone 80 và 100 WPM không cắt; 120 WPM 2 lần (0,1 trên 1.000 phím, giọng bị cắt đã 376 ms tuổi trở lên, dưới đỉnh của nó 35 dB); 150 WPM 38 lần (1,6); 180 WPM 376 lần (15,7), từ 150 WPM có lần cắt đúng tiếng to đến muộn (−1,2 dB và 0 dB so với đỉnh). Cùng kết luận với mục Giọng ở trên: không cần tăng `keyVoices` cho người gõ tới khoảng 120 WPM.

### Mới thấy khi rà soát: phím Hail Stone nhỏ hơn mọi bộ khác khoảng 13 dB

Các bộ Firefly khác được khớp độ to (kit không chỉnh mức từng bộ hay từng mẫu: mức phát chỉ là `TYPING_SOUND_MAP` nhân âm lượng Keyboard, manifest của bộ không có trường gain). Đo RMS 20 ms to nhất của từng mẫu phím (lấy khoảng 10 phím mỗi bộ):

- 32 bộ cũ: trung vị mỗi bộ từ −28,4 đến −27,1 dBFS (trung vị chung −27,8); Raindrop Tile −24,9.
- Hail Stone: trung vị −40 đến −42 dBFS, tức nhỏ hơn bộ nhỏ nhất khoảng 12–14 dB. Trong bộ, các phím chênh nhau 30 dB (−51,7 đến −21,8; Solid Amber chênh 2 dB): `key-17` −51,7, `key-18` −50,5, `key-03` −50,2, `key-24` −48,5 gần như không nghe thấy khi game đang có nhạc và hiệu ứng.
- Phím cách Hail Stone (trung vị −31) to hơn phím của chính nó khoảng 9 dB; ở các bộ khác phím và phím cách gần bằng nhau.
- Bản nghe thử lại to như các bộ khác (−30,7 LUFS; Raindrop Tile −28,3, Solid Amber −31,3; RMS 20 ms to nhất −17,6 dBFS), nên rê chuột nghe thử thấy to, gõ thật thì nhỏ hơn nhiều.

Không sửa trong game: media lấy nguyên từ staging, và bù mức ở game cần sửa kit (thêm gain theo bộ) ở repo cha. Chủ dự án cần nghe trong game và quyết: giữ như bản chọn, nâng mức phím trong staging (chuẩn hoá tới khoảng −28 dBFS như các bộ khác, hoặc nén chênh lệch giữa các phím) rồi chép lại, hay để kit đọc gain theo bộ.

- Commit này chỉ thêm mục rà soát vào changelog. `pnpm check` sau rà soát: kit 95/95 file, 58 file test, 520 test, TypeScript và Vite build đạt. Không chạy lại trình duyệt: mã game, kit, danh mục và media không đổi so với lần kiểm trình duyệt ở trên.
