# 31/10/2026 · Dragonhold · Kit: bảng Sound nhận hàm tải của game

Worktree `games/.wt-dh-keys`, nhánh `dh-keys`. Sửa kit sau B3 (giai đoạn G3) của [`docs/games/TYPING_FEEL_SERVICE.md`](../../../../docs/games/TYPING_FEEL_SERVICE.md) ở repo cha, mục 4.6 ("API đã làm ở G2") và 5.1.

## Kit

Đồng bộ kit từ `shared/game-kit` của cha (chưa commit ở cha lúc đồng bộ; điều phối commit). Chỉ thêm, không phá:
- `QuickSettings` nhận `keyboardFetch: { fetchJson?, fetchBytes? }`. Hàng âm phím của bảng Sound tải manifest bộ, file mẫu và preview bằng hai hàm này. Bỏ trống thì dùng fetch của kit như trước.
- `QuickSettings` nhận `onKeyboardLoad(result)` và `onKeyboardFail(choice)`. `onKeyboardFail` báo khi bộ người chơi vừa chọn trong bảng không phát được (không có mẫu nào, hoặc nạp lỗi), để game cho âm gốc phát thay. Chỉ lần chọn mới nhất báo. `KeyboardSoundPreview` có thêm `onFail`.
- `timedBytes(timeoutMs = 8000)`: tải file mẫu có hạn giờ, cùng cách với `timedJson` (`KEYBOARD_SAMPLE_TIMEOUT_MS`).
- `setChoiceOptions` dựng lại danh sách mà không phát preview, không dừng preview đang nghe, không dời focus bàn phím; giữ dòng đang chọn và vị trí cuộn.
  - Chuột đứng yên mà dòng khác trượt tới dưới nó (Chrome gửi `pointerenter` không kèm `pointermove`): không phát, không dừng gì, tới khi chuột thật sự di chuyển. `QuickSettings` nhớ chỗ chuột cuối cùng và đưa cho danh sách mới (`settle: { pointer }`).
  - Bảng đang mở thì giữ nguyên mép trên tới khi đóng hay khung đổi cỡ, không căn giữa lại rồi nhảy lên khi danh mục về.
- Đợt giải mã đầu (16 file) không giải mã được file nào thì `TypingSounds.load` dừng, không xin phần còn lại. Host treo thì một bộ kết thúc sau một lần hết giờ (8 s với `timedBytes`), không phải 8 s cho mỗi đợt.
- Dòng vừa đang chọn vừa tắt ("Saved sound · unavailable") nay đọc được: chữ xám nhạt trên nền tối, có vạch xanh bên trái. Dòng đang chọn giữ nền xanh khi rê chuột. Mọi trạng thái từ 4,5:1 trở lên.

## Game

- Test `tests/app/settings-and-keyboard.test.ts` ("does not refetch a set whose samples cannot be fetched…"): bộ mà mọi file mẫu đều 404 nay chỉ xin manifest và đợt đầu 16 file mỗi lượt nạp (trước đó cả 88 file). Test tính số lần xin theo luật mới; ý của test giữ nguyên: không xin lại mỗi lần gõ phím, chỉ xin lại khi chọn lại hay tải lại trang.
- Mã game chưa đổi. Bước B4 dùng các tuỳ chọn trên khi chuyển sang Typing Feel (mẫu: Last Line, mục 5.1 bước 5 của tài liệu): `keyboardFetch: { fetchJson: timedJson(3000, { cache: "default" }), fetchBytes: timedBytes() }` và `onKeyboardFail` cho âm gốc phát thay, không cần lớp con `TypingSounds`.

## Kiểm

- `pnpm check` xanh: `verify-kit` 95 file khớp manifest, `vitest run` 58 file, 520 test, `tsc --noEmit` và build.
  - Lần chạy đầu sau khi đồng bộ hỏng 1 test (con số 89 lần xin của bộ hỏng, nay 17). Đã sửa test như trên.
- `kit:sync --check --target games/.wt-dh-keys` báo OK.
