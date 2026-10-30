# 30/10/2026 · Tiếng phím: 32 bộ Firefly, nhóm theo họ

Chủ dự án giữ 32 bộ tiếng phím (phiếu 218 ở repo cha) cho mọi game; Dragonhold đổi từ 7 bộ của phiếu 192 sang 32 bộ.

## Đã làm

- Kit đồng bộ ở parent `4ae665b2` từ bản xuất sạch `tmp/kit-export` (`parentDirty: false`): danh sách bàn phím nhóm theo họ (tiêu đề họ, PageUp/PageDown nhảy họ, cuộn tới bộ đang chọn), bộ nhiều biến thể không lặp trong 8 lần gõ, giải mã từng đợt 16 file, nhả bộ cũ khi đổi.
- `public/assets/dragon-hold/audio/keys/`: chép nguyên `~/AudioLab/review/staging/keys-firefly/` (bỏ `.firefly-builder.json`, không có WAV). 32 bộ thuộc 7 họ (Deep, Warm, Rounded, Solid, Crisp, Clear, Bright Clack), mỗi bộ 70–80 phím, 8 phím cách và `preview.ogg` 1 giây; tổng 2.684 OGG, 26 MB.
- `media.md5`: 2.684 dòng OGG thay cho 107 dòng cũ, sắp xếp như công cụ media của repo cha. 33 file `keys-manifest.json` (danh mục và từng bộ) nằm trong Git, không có trong `media.md5`.
- `.gitignore`: chỉ mở các thư mục dẫn tới `audio/keys/` và các file `keys-manifest.json`; `!public/assets/` giữ lại vì `.git/info/exclude` của máy này có dòng `public/assets`.
- Mặc định là `bright-clack` (Bright Clack Velvet). Bảy id cũ vẫn còn nên save cũ giữ lựa chọn. Save trỏ tới bộ không còn thì về mặc định, rồi một bộ Firefly bất kỳ, rồi tiếng gõ gốc Dragonhold.
- Danh sách: Off, Dragonhold (tiếng gõ gốc, kit đặt ngay sau Off), rồi 7 họ.
- Bộ đã lưu được tải khi có thao tác đầu tiên, phát được ngay từ đợt giải mã đầu; đổi sang bộ khác hoặc đóng game thì lượt tải bị hủy và mẫu đã giải mã được nhả.

## Kiểm

`pnpm check` đạt: kit 95/95 file, 58 file test, 514 test, TypeScript và Vite build. Bốn ván vàng giữ nguyên mã băm (`src/sim`, `src/typing`, `src/content`, `tests/golden` không đổi). Chưa nghe và nhìn trong trình duyệt; điều phối kiểm sau.

## Làm thêm bộ sau này

Nguồn, chỗ đặt file và lệnh dựng lại nằm ở `docs/games/audio/KEYS_FIREFLY_HANDOFF.md` của repo cha. Có bộ mới thì chép lại thư mục staging vào đây, chạy lại bước `media.md5`, rồi sửa số bộ và số file trong `tests/app/settings-and-keyboard.test.ts` và `tests/app/quick-settings.test.ts`.
