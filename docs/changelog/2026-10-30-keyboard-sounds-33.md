# 30/10/2026 · Tiếng phím: bộ thứ 33, Raindrop Tile

Chủ dự án chọn thêm bộ Raindrop Tile (bản A, xử lý tự nhiên: giữ trọn đuôi và tiếng giọt nước, không EQ) cho mọi game. Dragonhold giờ có 33 bộ Firefly.

## Đã làm

- `public/assets/dragon-hold/audio/keys/raindrop-tile/`: chép nguyên từ `~/AudioLab/review/staging/keys-firefly/raindrop-tile/`: 17 phím, 8 phím cách, `preview.ogg` 1 giây và `keys-manifest.json` (schema `typing-keys-firefly/2`, `files: [{file, set, durationMs}]`, `preview`). OGG Vorbis stereo 48 kHz (32 bộ kia mono); phím dài 155–450 ms, phím cách 401–535 ms; cả bộ 272 KB.
- Danh mục gốc `keys-manifest.json` chép nguyên từ staging. Bản staging thụt lề 1 dấu cách nên `git diff` đổi cả file; `git diff -w` chỉ còn mục mới và các số `order`. Raindrop Tile thuộc họ Crisp, `order` 18, ngay sau Crisp Silk; các bộ sau lùi một (Clear Velvet là 19 … Bright Clack Ember là 32). Mục này có `score: null` và `ownerPick: true`: bộ không được chấm bằng thước của phiếu 218, vì vế đuôi trong thước đó phạt chính cái đuôi dài chủ dự án muốn. Kit vốn bỏ qua `score` không phải số, nên không sửa kit và không bịa điểm.
- `media.md5`: thêm 26 dòng OGG theo thứ tự đường dẫn như cũ (dòng tiếng phím từ 2.684 lên 2.710, cả file 4.779 dòng); không dòng nào khác đổi. File manifest mới nằm trong Git (`.gitignore` đã mở `**/keys-manifest.json`), OGG vẫn bị bỏ qua.
- Mặc định vẫn là `bright-clack`. Mã game và kit không đổi.

## Mẫu dài: đã kiểm, không chỗ nào cắt đuôi

- Mỗi lần phát lấy một giọng. Game dùng mặc định của kit (`TypingSounds`): 6 giọng cho phím, 2 giọng cho phím cách. Giọng cũ nhất chỉ bị cắt (mờ 4 ms) khi mọi giọng đều đang kêu. Phím 450 ms (464 ms khi cao độ hạ 3 %) thì 6 giọng đủ cho khoảng 13 phím mỗi giây (khoảng 155 WPM) mà không cắt; ở 10 phím mỗi giây có nhiều nhất 5 giọng cùng kêu. Phím cách 535 ms thì 2 giọng đủ cho một phím cách mỗi 0,28 giây.
- Không có giới hạn độ dài nào khác: `TypingSounds.play()` lấy độ dài thật của mẫu đã giải mã; bản nghe thử cắt ở 1 giây, bằng đúng `preview.ogg` (1,000 giây như 32 bộ kia). Stereo đi thẳng qua `AudioBufferSourceNode` và `GainNode`, không bước nào giả định mono.
- Gõ nhanh hơn khoảng 13 phím mỗi giây thì đuôi phím cũ nhất bị cắt 4 ms, như mọi bộ khác. Muốn giữ đuôi cả lúc ấy thì phải tăng `keyVoices` trong kit ở repo cha; lần này không làm.

## Test (viết trước, đỏ trước khi chép media)

- `tests/app/settings-and-keyboard.test.ts`:
  - 33 bộ, 7 họ liền mạch; Raindrop Tile đứng giữa Crisp Silk và Clear Velvet. Mục danh mục có `score: null`, `ownerPick: true`, `order: 18`, và là bộ duy nhất không có điểm số.
  - Raindrop Tile có 17 phím, các bộ khác 70–80 phím; tổng 2.413 phím và 264 phím cách.
  - `media.md5` liệt kê đúng 2.710 OGG dưới `audio/keys`, khớp mã băm.
  - Với độ dài thật lấy từ manifest, gõ 10 phím và 2 phím cách mỗi giây trong 4 giây: 40 lần phát, không giọng nào bị lấy, không mẫu nào bị dừng sớm.
- `tests/app/quick-settings.test.ts`: 35 lựa chọn (Off, Dragonhold, 33 bộ), Raindrop Tile nằm cuối họ Crisp; chuyển qua Raindrop Tile trong bảng Sound vẫn chỉ giữ một bộ đã giải mã.

## Kiểm

`pnpm check` đạt: kit 95/95 file, 58 file test, 519 test, TypeScript và Vite build. Bốn ván vàng giữ nguyên mã băm (`src/sim`, `src/typing`, `src/content`, `tests/golden` không đổi).

Trình duyệt (Vite dev `dh-keys-dev`, cổng 4149, cỡ desktop, 30/10 chiều):

- Bảng Sound: 35 lựa chọn (Off, Dragonhold, 33 bộ), bảy tiêu đề họ; Raindrop Tile nằm dưới Crisp, ngay sau Crisp Silk, trước tiêu đề Clear.
- Rê chuột lên Raindrop Tile khoảng 1,5 giây: chỉ tải `raindrop-tile/preview.ogg` (200, 15.073 byte).
- Chọn Raindrop Tile: tải `keys-manifest.json` của bộ, đủ 17 phím và 8 phím cách, không tải bộ nào khác; lưu `keyboard: "raindrop-tile"` vào `dragon-hold:settings:v1`.
- Gõ `place`, Enter, phím cách trong ván: 5 phím phát mẫu stereo dài 298–450 ms, phím cách 535 ms; không lỗi console. Sau khi kiểm, cài đặt trên cổng dev trả về `bright-clack`.
- Lỗi có sẵn của kit, không do bộ mới: dòng đang chọn mà chuột còn nằm trên nó có chữ tối trên nền tối (`.kit-keyboards button:hover:not(:disabled)` mạnh hơn `[aria-selected="true"]`, nên nền thành `--kit-qs-bg` mà chữ vẫn là `--kit-qs-accent-text`). Sửa ở `shared/game-kit` repo cha; lần này không làm.
