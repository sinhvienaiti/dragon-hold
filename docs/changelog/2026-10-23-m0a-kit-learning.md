# 23/10/2026 · M0a: Esc giữ số lỗi trong kit, Học trước theo 01 §6.6

Làn kit và tính nhất quán của việc học. Sửa hai mục mở trong `2026-10-23-m0a.md` (mục "Còn thiếu, cần anh quyết").

## Esc và số lỗi (01 §3.3)

- **Trước:** kit (`routeUnlock`) đặt số lỗi của từ về 0 khi Esc. Game tự lưu số lỗi rồi ghi lại sau khi gọi kit (`releaseLock` trong `src/sim/words.ts`), nên hai bên làm ngược nhau.
- **Luật chọn:** Esc nhả khóa và bỏ các chữ đã gõ. Số phím sai đã có trên từ vẫn ở lại tới khi từ xong hoặc biến mất, như Backspace, nên vẫn tính vào điểm (e) và sự kiện học (01 §3.3, 00 D14).
- **Kit:** thêm tùy chọn `RouterRules.unlockErrors` (`"drop"` hoặc `"keep"`, không có thì là `"drop"`). `TD_TYPING` ghi rõ `"drop"`, nên hành vi TD và mọi cấu hình cũ giữ nguyên. `routeUnlock(router, live, keepErrors = false)`, `unlock(t)` đọc tùy chọn từ luật của phiên. Ghi một dòng ở `shared/game-kit/DRIFT.md`.
- **Game:** `src/typing/config.ts` đặt `unlockErrors: "keep"`. `releaseLock` bỏ đoạn tự lưu và ghi lại số lỗi. `scripts/balance/calibrate.ts` chỉnh bot với cùng luật Esc (`typingConfig(TD_TYPING, { router: { unlockErrors: "keep" } })`).
- Chỉ `dragon-hold` dùng module `typing/` của kit (`typing-defense`, `typing-survival` không khai module này). Chỉ chép lại kit vào `dragon-hold`.
- Kết quả trong trận không đổi so với trước, nên mã băm golden không đổi.

## Học trước (01 §6.6)

- Học trước gửi `activityType: "review-card"` kèm `hintUsed: true`. Đây đúng là điều 01 §6.3 và §6.6 muốn: lúc gõ, khung Học trước hiện từ, IPA và nghĩa, mà `hintUsed` là `true` khi nghĩa hoặc IPA đang hiện.
- **Chỗ lệch thật:** 01 §6.3 đếm "lần nhớ đúng" là mọi lần đúng ở `review-card`. Trên máy, câu Học trước đã không được đếm. Nhưng `parseLookup` (đọc mẫu gần đây từ portal) vẫn đếm mọi `review-card` đúng, kể cả câu Học trước. Khi portal có truy vấn trả `recentSamples` (01 §6.8), một lần gõ chép sẽ thành lần nhớ, trái 00 D14.
- **Sửa:** một luật chung `isRightRecall(activityType, result, hintUsed)` trong `src/app/learning.ts`: hoạt động nhớ (`meaning-recall`, `listening`, `review-card`), kết quả đúng, không có `hintUsed`. Dùng cho cả bản lưu trên máy (`recordRecall`) và mẫu từ portal (`parseLookup`).

## Test

- Kit: test mới trong `typing/router.test.ts`: `"keep"` giữ lỗi, gõ lại từ thì điểm vẫn tính lỗi đó; luật không có tùy chọn vẫn xóa lỗi như cũ.
- Game: test mới trong `tests/typing-learning.test.ts`: sự kiện Học trước là `review-card`, có `hintUsed`, không tăng số lần nhớ trên máy, và mẫu `hintUsed` từ portal không được đếm. Test Esc có sẵn trong `tests/typing-words.test.ts` nay chạy qua tùy chọn của kit.
- `pnpm --dir shared/game-kit exec vitest run`: 275/275. Kit `tsc`: 0 lỗi. `pnpm kit:check`: 3 game đạt.
- `dragon-hold`: `verify-kit` 73 file khớp, `tsc --noEmit` 0 lỗi, `vitest` 322/322 (golden 7/7, ranh giới 8/8).
- Chạy lại 24/10 trên cây hiện tại (có thay đổi của làn khác chưa commit): kit `vitest` 275/275, kit `tsc` 0 lỗi; `dragon-hold` `verify-kit` 73 file khớp, `tsc --noEmit` 0 lỗi, `vitest` 347/347.

## Đề xuất ghi vào tài liệu

- 01 §3.3, thay "Esc nhả khóa.": "Esc nhả khóa và bỏ các chữ đã gõ; số phím sai đã có trên từ vẫn giữ tới khi từ xong hoặc mất (như Backspace), nên vẫn tính vào e và sự kiện học (mục 6.6)."
- 01 §6.3, dòng "Lần nhớ đúng": thêm "và không có `hintUsed`". 01 §6.6: "Học trước gửi `review-card` kèm `hintUsed: true` (từ, IPA, nghĩa đang hiện), nên không tính là lần nhớ."

## Còn mở

- Từ đã Esc còn lỗi cũ thì không đổi khóa mềm được khi khóa lại (kit chỉ đổi khóa mềm khi từ chưa có lỗi). Hành vi này đã có từ trước, nay chỉ chuyển vào kit. Muốn đổi thì cần thêm trạng thái vào sim và cập nhật golden.
