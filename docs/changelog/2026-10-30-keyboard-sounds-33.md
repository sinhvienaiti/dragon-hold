# 30/10/2026 · Tiếng phím: bộ thứ 33, Raindrop Tile

Chủ dự án chọn thêm bộ Raindrop Tile (bản A, xử lý tự nhiên: giữ trọn đuôi và tiếng giọt nước, không EQ) cho mọi game. Dragonhold giờ có 33 bộ Firefly.

## Đã làm

- `public/assets/dragon-hold/audio/keys/raindrop-tile/`: chép nguyên từ `~/AudioLab/review/staging/keys-firefly/raindrop-tile/`: 17 phím, 8 phím cách, `preview.ogg` 1 giây và `keys-manifest.json` (schema `typing-keys-firefly/2`, `files: [{file, set, durationMs}]`, `preview`). OGG Vorbis stereo 48 kHz (32 bộ kia mono); phím dài 155–450 ms, phím cách 401–535 ms; cả bộ 222.016 byte (26 OGG và manifest; `du` báo 272 KB vì làm tròn theo khối đĩa).
- Danh mục gốc `keys-manifest.json` chép nguyên từ staging. Bản staging thụt lề 1 dấu cách nên `git diff` đổi cả file; `git diff -w` chỉ còn mục mới và các số `order`. Raindrop Tile thuộc họ Crisp, `order` 18, ngay sau Crisp Silk; các bộ sau lùi một (Clear Velvet là 19 … Bright Clack Ember là 32). Mục này có `score: null` và `ownerPick: true`: bộ không được chấm bằng thước của phiếu 218, vì vế đuôi trong thước đó phạt chính cái đuôi dài chủ dự án muốn. Kit vốn bỏ qua `score` không phải số, nên không sửa kit và không bịa điểm.
- `media.md5`: thêm 26 dòng OGG theo thứ tự đường dẫn như cũ (dòng tiếng phím từ 2.684 lên 2.710, cả file 4.779 dòng); không dòng nào khác đổi. File manifest mới nằm trong Git (`.gitignore` đã mở `**/keys-manifest.json`), OGG vẫn bị bỏ qua.
- Mặc định vẫn là `bright-clack`. Mã game và kit không đổi.

## Mẫu dài: đã kiểm, không chỗ nào cắt phần đuôi còn nghe được

- Mỗi lần phát lấy một giọng. Game dùng mặc định của kit (`TypingSounds`): 6 giọng cho phím, 2 giọng cho phím cách. Giọng cũ nhất chỉ bị cắt (mờ 4 ms) khi mọi giọng đều đang kêu. Phím 450 ms (464 ms khi cao độ hạ 3 %) thì 6 giọng đủ cho khoảng 13 phím mỗi giây (khoảng 155 WPM) mà không cắt; ở 10 phím mỗi giây có nhiều nhất 5 giọng cùng kêu. Phím cách 535 ms thì 2 giọng đủ cho một phím cách mỗi 0,28 giây.
- Không có giới hạn độ dài nào khác: `TypingSounds.play()` lấy độ dài thật của mẫu đã giải mã; bản nghe thử cắt ở 1 giây, bằng đúng `preview.ogg` (1,000 giây như 32 bộ kia). Stereo đi thẳng qua `AudioBufferSourceNode` và `GainNode`, không bước nào giả định mono.
- Gõ nhanh hơn khoảng 13 phím mỗi giây thì giọng phím cũ nhất bị cắt (mờ 4 ms), như mọi bộ khác. Phần bị cắt khi ấy không còn nghe được: đo mức RMS 10 ms (gộp hai kênh), mẫu phím nào cũng xuống dưới đỉnh của nó hơn 40 dB sau 40–230 ms (trung vị 100 ms); muốn cắt một giọng trẻ hơn thế thì phải có 7 lần gõ trong 230 ms (khoảng 26 phím mỗi giây). Mô phỏng 4.000 từ 4–8 chữ, trong từ nhanh hơn trung bình 25 %, 6 giọng: mỗi tốc độ khoảng 23.700 phím: 80 và 100 WPM gần như không cắt (1 và 0 lần), 120 WPM 4,9 lần trên 1.000 phím, 150 WPM 45, 180 WPM 194; lần nào cũng rơi vào giọng đã 255 ms tuổi trở lên và đã dưới đỉnh hơn 40 dB, ngay dưới tiếng gõ mới. Vì vậy không tăng số giọng. Nếu sau này muốn, game truyền `keyVoices` cho `new TypingSounds(...)` trong `src/app/keyboard.ts`, không phải sửa kit.

## Test (viết trước, đỏ trước khi chép media)

- `tests/app/settings-and-keyboard.test.ts`:
  - 33 bộ, 7 họ liền mạch; Raindrop Tile đứng giữa Crisp Silk và Clear Velvet. Mục danh mục có `score: null`, `ownerPick: true`, `order: 18`, và là bộ duy nhất không có điểm số.
  - Raindrop Tile có 17 phím, các bộ khác 70–80 phím; tổng 2.413 phím và 264 phím cách.
  - `media.md5` liệt kê đúng 2.710 OGG dưới `audio/keys`, khớp mã băm.
  - Với độ dài thật lấy từ manifest, gõ 10 phím và 2 phím cách mỗi giây trong 4 giây: 48 lần phát (40 phím, 8 phím cách), không giọng nào bị lấy, không mẫu nào bị dừng sớm. (Bản đầu chỉ phát 8 phím và 2 phím cách mỗi giây, 40 lần, dù tên test nói 10 phím; rà soát sửa lại cho đúng tên.)
- `tests/app/quick-settings.test.ts`: 35 lựa chọn (Off, Dragonhold, 33 bộ), Raindrop Tile nằm cuối họ Crisp; chuyển qua Raindrop Tile trong bảng Sound vẫn chỉ giữ một bộ đã giải mã.

## Kiểm

`pnpm check` đạt: kit 95/95 file, 58 file test, 519 test, TypeScript và Vite build. Bốn ván vàng giữ nguyên mã băm (`src/sim`, `src/typing`, `src/content`, `tests/golden` không đổi).

Trình duyệt (Vite dev `dh-keys-dev`, cổng 4149, cỡ desktop, 30/10 chiều):

- Bảng Sound: 35 lựa chọn (Off, Dragonhold, 33 bộ), bảy tiêu đề họ; Raindrop Tile nằm dưới Crisp, ngay sau Crisp Silk, trước tiêu đề Clear.
- Rê chuột lên Raindrop Tile khoảng 1,5 giây: chỉ tải `raindrop-tile/preview.ogg` (200, 15.073 byte).
- Chọn Raindrop Tile: tải `keys-manifest.json` của bộ, đủ 17 phím và 8 phím cách, không tải bộ nào khác; lưu `keyboard: "raindrop-tile"` vào `dragon-hold:settings:v1`.
- Gõ `place`, Enter, phím cách trong ván: 5 phím phát mẫu stereo dài 298–450 ms, phím cách 535 ms; không lỗi console. Sau khi kiểm, cài đặt trên cổng dev trả về `bright-clack`.
- Lỗi có sẵn của kit, không do bộ mới: dòng đang chọn mà chuột còn nằm trên nó có chữ tối trên nền tối (`.kit-keyboards button:hover:not(:disabled)` mạnh hơn `[aria-selected="true"]`, nên nền thành `--kit-qs-bg` mà chữ vẫn là `--kit-qs-accent-text`). Sửa ở `shared/game-kit` repo cha; lần này không làm.

## Rà soát (Claude, 30/10 chiều)

Kiểm lại từng điều trên với file thật, không chỉ đọc mã:

- Media: `diff -r` thư mục `raindrop-tile/` và `cmp` danh mục gốc với staging: giống từng byte. 26 dòng `media.md5` khớp `md5` của 26 OGG; `media.md5` vẫn xếp đúng thứ tự đường dẫn. OGG bị `.gitignore` bỏ qua (dòng `*.ogg`), chỉ `raindrop-tile/keys-manifest.json` nằm trong Git.
- `ffprobe`: cả 26 OGG là Vorbis 48 kHz, 2 kênh; độ dài khớp `durationMs` trong manifest tới mili giây; `preview.ogg` 1,000 giây như `preview.ogg` của 32 bộ kia. Đuôi kết thúc êm: đỉnh của 10 ms cuối ở mọi mẫu phím và phím cách là −83 dB trở xuống (`preview.ogg` −80 dB), nên chỗ cắt 450 ms không gây tiếng tách.
- Danh mục: 33 mục, `order` 0–32 liền nhau, Raindrop Tile là 18; `loadKeyboardCatalog` chỉ giữ `score` khi là số hữu hạn, nên `score: null` không chặn bộ và không hiện ở đâu; trường `note` của mục không đi vào giao diện. Bộ đủ ngưỡng "ready" của kit (ít nhất 10 phím, 3 phím cách).
- Không chỗ nào giả định mẫu ngắn hay mono: không có hằng độ dài tối đa, bộ nạp lấy `buffer.duration`, bản nghe thử 1 giây đúng bằng `preview.ogg`; giới hạn giọng đã đo ở mục trên.
- Sửa: tên test 10 phím mỗi giây nay đúng như tên (48 lần phát); trong changelog sửa cỡ bộ (222.016 byte, không phải 272 KB), câu `keyVoices` (game tự truyền được, không cần sửa kit) và thêm số đo đuôi.
- `pnpm check` sau rà soát: kit 95/95 file, 58 file test, 519 test, TypeScript và Vite build đạt. Không chạy lại trình duyệt: mã game, kit và media không đổi so với lần kiểm trình duyệt ở trên.
