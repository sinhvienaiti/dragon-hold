# 30/10/2026 · Tiếng phím: 32 bộ Firefly, nhóm theo họ

Chủ dự án giữ 32 bộ tiếng phím (phiếu 218 ở repo cha) cho mọi game; Dragonhold đổi từ 7 bộ của phiếu 192 sang 32 bộ.

## Đã làm

- Kit đồng bộ ở parent `4ae665b2` từ bản xuất sạch `tmp/kit-export` (`parentDirty: false`): danh sách bàn phím nhóm theo họ (tiêu đề họ, PageUp/PageDown nhảy họ, cuộn tới bộ đang chọn), bộ nhiều biến thể không lặp trong 8 lần gõ, giải mã từng đợt 16 file, nhả bộ cũ khi đổi.
- `public/assets/dragon-hold/audio/keys/`: chép nguyên `~/AudioLab/review/staging/keys-firefly/` (bỏ `.firefly-builder.json`, không có WAV). 32 bộ thuộc 7 họ (Deep, Warm, Rounded, Solid, Crisp, Clear, Bright Clack), mỗi bộ 70–80 phím, 8 phím cách và `preview.ogg` 1 giây; tổng 2.684 OGG, 26 MB.
- `media.md5`: 2.684 dòng OGG thay cho 107 dòng cũ, sắp xếp như công cụ media của repo cha. 33 file `keys-manifest.json` (danh mục và từng bộ) nằm trong Git, không có trong `media.md5`.
- `.gitignore`: chỉ mở các thư mục dẫn tới `audio/keys/` và các file `keys-manifest.json`; `!public/assets/` giữ lại vì `.git/info/exclude` của máy này có dòng `public/assets`.
- Mặc định là `bright-clack` (Bright Clack Velvet). Bảy id cũ vẫn còn nên save cũ giữ lựa chọn. Save trỏ tới bộ không còn thì về mặc định, rồi một bộ Firefly bất kỳ, rồi tiếng gõ gốc Dragonhold.
- Danh sách: Off, Dragonhold (tiếng gõ gốc, kit đặt ngay sau Off), rồi 7 họ.
- Bộ đã lưu được tải khi có thao tác đầu tiên, phát được ngay từ đợt giải mã đầu; đổi sang bộ khác hoặc đóng game thì lượt tải bị hủy và mẫu đã giải mã được nhả. Lúc đầu điều này chỉ đúng cho lượt tải lúc khởi động; đổi bộ trong bảng Sound được sửa sau review (mục dưới).

## Kiểm

`pnpm check` đạt: kit 95/95 file, 58 file test, 514 test, TypeScript và Vite build. Bốn ván vàng giữ nguyên mã băm (`src/sim`, `src/typing`, `src/content`, `tests/golden` không đổi). Chưa nghe và nhìn trong trình duyệt; điều phối kiểm sau.

## Sửa sau review (30/10)

- Đổi bộ trong bảng Sound giờ nhả mẫu đã giải mã của bộ cũ. Kit gọi `onChange` (game gọi `GameKeyboard.changed()`) rồi mới tới `keyboardPreview.select()`, và picker chỉ nhả bộ nó thấy đang phát. `changed()` trước đây chỉ `use("off")` nên picker không thấy bộ cũ, mỗi bộ đã chọn trong phiên ở lại bộ nhớ (khoảng 1 MB PCM mỗi bộ, 35 MB nếu bấm qua cả 32 bộ). Giờ `changed()` nhả bộ đang phát, nên lúc nào cũng chỉ còn một bộ được giải mã; Off và Dragonhold không giữ bộ nào. Chọn lại đúng bộ đang dùng thì giữ nguyên, bản nghe thử 1 giây của bộ mới không bị cắt. Test: `tests/app/quick-settings.test.ts` bấm picker thật sau khi bộ đã lưu tải xong.
- Bộ không tải được (manifest hoặc OGG lỗi, ví dụ máy chưa kéo media từ Drive) được nhớ đến khi người chơi chọn lại hoặc tải lại trang. Trước đây mỗi phím gõ lại tải cả bộ: 10 chữ là 890 request. Giờ là một lượt, thêm một lượt sau mỗi lần chọn lại. Test: `tests/app/settings-and-keyboard.test.ts` (thiếu OGG, và thiếu cả manifest).
- `pnpm check` đạt: kit 95/95 file, 58 file test, 517 test, TypeScript và Vite build; bốn ván vàng giữ mã băm. Chưa nghe trong trình duyệt.

## Ghi chú cho kit: phím cách không im lúc tải

Kit giải mã hết file phím rồi mới tới file phím cách, 16 file mỗi đợt, nên mẫu phím cách về sau khoảng 5–6 đợt. Trong lúc đó phím cách không im: `TypingSounds.play()` thấy bộ chưa có mẫu phím cách thì phát một mẫu phím, tới khi mẫu phím cách về. Đưa vài file phím cách vào đợt đầu (trong `shared/game-kit`) chỉ để tiếng phím cách thật đến sớm hơn; không có lỗi im tiếng nào cần sửa.

## Làm thêm bộ sau này

Nguồn, chỗ đặt file và lệnh dựng lại nằm ở `docs/games/audio/KEYS_FIREFLY_HANDOFF.md` của repo cha. Có bộ mới thì chép lại thư mục staging vào đây, chạy lại bước `media.md5`, rồi sửa số bộ và số file trong `tests/app/settings-and-keyboard.test.ts` và `tests/app/quick-settings.test.ts`.
