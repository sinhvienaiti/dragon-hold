# 29/10/2026 · Dragonhold · Chữ người chơi đọc bằng tiếng Anh

Phiếu 131, worktree `games/.wt-dh-codex`, nhánh `dh-codex`.

## Thay đổi

Đổi chữ trong HUD, menu dừng, thẻ tốc độ, thẻ học trước/ôn, cửa hàng,
đặt/nâng/bán món, thẻ ra mắt quái, cảnh báo đợt và kết quả sang tiếng Anh.
Tên game trên trang và thông báo nạp là **Dragonhold**; trang khai báo
`lang="en"`. Tên bản đồ, đường và ải đổi giá trị hiển thị, giữ trường
`nameVi` để tương thích dữ liệu. Tên riêng hai rồng giữ dấu: `Hỏa Long` và
`Bạch Long` (lượt duyệt khôi phục); các tên thực thể tiếng Anh đã có giữ theo bảng tên chung.

Nghĩa Việt của từ đang học được giữ nguyên. Không đổi id, khóa lưu, event,
phím, thông số, nhịp mô phỏng hoặc golden. Rút gọn nhãn như `Replay`,
`Loadout`, `Review`, `Gen.`, `Mob`, `Seal`, `Aid`; bảng duyệt đánh dấu các
chuỗi còn dài hơn 20% để Claude kiểm trên ô thực tế.

Cập nhật kỳ vọng chữ trong tám file test cũ. Thêm năm test trong
`tests/english-ui.test.ts`: quét literal/template (kể cả Unicode escape),
phân biệt chú thích/IPA/dấu nhân, ngoại lệ hẹp cho nghĩa `vi` của mẫu UI,
và tên/ngôn ngữ trang. Không bỏ qua cả file hiển thị nghĩa từ vựng.

## Kiểm và giới hạn (lượt Codex, trước lượt duyệt)

- Trước sửa: `pnpm check` đạt **475/475 test**, 54 file; kit, TypeScript và
  build đạt.
- Sau sửa: **479/480 test**, 54 file xanh và 1 file đỏ. Chỉ test quét đỏ:
  còn 15 literal trong `src/audio/dev/harness.ts` và trang
  `src/audio/dev/harness.html`, đều ngoài phạm vi ghi của phiếu. Đây là
  trang dev riêng, không được game import. Đã hỏi chủ dự án cách xử lý;
  chưa sửa trang dev hay tự ý thêm ngoại lệ.
- TypeScript chạy riêng `pnpm exec tsc --noEmit` đạt. Golden chạy riêng
  **10/10**, diff `tests/golden` rỗng.
- Đột biến tạm `"Bắt đầu"` trong `src/ui/screen-zones.ts` được bắt: 17 mục
  thay vì 16; khôi phục đúng từng byte, còn 16 mục cũ. Chưa có lượt xanh
  sau khôi phục vì vướng phạm vi trang dev.
- Không có lỗi test thời gian cần chạy lại ba lần. Không mở dev server,
  trình duyệt, tạo media, cập nhật golden hay dùng Git ghi.

Bảng và bằng chứng nằm ở **repo cha**:
`docs/codex-queue/131-report.md`, `docs/codex-queue/131/`. Chưa nghiệm thu
chữ tràn ở 1280/1920; Claude duyệt sau khi chốt ngoại lệ trang dev.

## Claude duyệt (29/10)

- **Trang dev âm thanh:** `src/audio/dev/harness.{html,ts}` là trang dev, không vào bản build: Vite chỉ build `index.html`, `dist/` sau build không có harness hay `__audioHarness`, không file game nào link hay import trang này. Test quét loại đúng hai đường dẫn này trong danh sách `DEV_ONLY` có chú thích; thêm test giữ điều kiện đó (vite.config và mọi file game không nhắc `audio/dev/` hay `harness.html/ts`). Không nới test cách nào khác.
- **Còn sót tiếng Việt người chơi thấy:** `sau <b>19 s</b>` trên thẻ đợt (không dấu nên máy quét không thấy) → `in`; gợi ý phím kết quả `Tab nghe` → `Tab listen`; số sát thương Perfect hiện `HOÀN HẢO` từ profile `DRAGON` của kit → `src/view/fx.ts` dùng `NUMBER_FEEL` (DRAGON với nhãn `PERFECT`), có test.
- **Kiểu Mỹ:** số thập phân dấu chấm (`viNumber`, `×1.04` của chuỗi, `0.3% HP per second`), phần trăm liền số (`73% HP`, `25%`).
- **Câu và nhãn:** `Prepare` → `Deploy` (Bày binh), `Play`/`Early` trên thẻ đợt → `Start`/`Call early`, `Type speed` → `Typing speed`, `Timed:` → `Measured:`, `Hit 95 % keys` → `95% keys right`, `Steady` (Hơi chậm) → `A bit slow`, `Trap`/`Pad`/`Hold spot` → `Trap slot`/`House pad`/`Block point`, `Unflag` → `Flag`, `Errors` → `Mistyped`, `Game portal` → `Back to portal`, `Try again: word` → `Not quite: word`, `Right!` → `Correct!`, nhãn cờ 3D `Plant` → `Banner`, `—` cho đường không quái → `Clear`, mức máu thấp `Hoa Long low on HP: press ⌥1 for a Small Potion`, các thông báo mua bằng phím thống nhất `Press 3 again to buy …`.
- **Trình duyệt (bản build, 1280×720 và 1920×1080):** thẻ tốc độ, học trước, bày binh, thẻ đợt, đặt món, HUD trận, màn che mất tiêu điểm, menu dừng, thẻ tốc độ từ menu, thẻ ôn lúc nghỉ, đợt 2, kết quả thua. Không chữ nào tràn hay bị cắt do lượt dịch; gợi ý `Place traps, units and houses first` xuống dòng ở 1280 nên rút còn `Place traps, units, houses first`.
- **Tên rồng (quyết định của điều phối viên):** giữ tên riêng có dấu `Hỏa Long`, `Bạch Long` ở mọi chỗ Codex viết `Hoa Long`/`Bach Long` (HUD, thẻ ra mắt, cửa hàng, kết quả, thông báo máu thấp, log tải model). Test quét có danh sách `PROPER_NAMES` có chú thích, gồm đúng hai rồng (NAMES_EN không có boss có tên riêng cho Dragonhold); chỉ đúng chuỗi tên đó được bỏ qua. Đột biến `"Hỏa Long choáng"` trong `src/ui/hud.ts` làm test đỏ, khôi phục thì xanh; test có thêm ca `"Hỏa"`, `"Long Hống"`, `"Bạch Long và Hỏa Long"` phải đỏ.
- **Lượt sửa bố cục (29/10), kiểm ở 1280×720 và 1920×1080 trên bản build:**
  - Ô cửa hàng 46 px (720p) làm `Need 35` xuống hai dòng, cỡ chữ đã ở sàn 11 px. Dạng ngắn trong ô nay là `−35` dưới giá (lý do đầy đủ `Need 35 Gold` vẫn hiện khi bấm), `Max 3 buys` thành `Max` cạnh huy hiệu 3/3; `.dh-cell__reason` không xuống dòng. Mọi ô một dòng ở cả hai cỡ, dải cửa hàng không rộng thêm.
  - Khung kết quả có `overflow: hidden` cắt mất viền rêu trang trí (`.dh-panel::before/::after` nằm ngoài hộp 3–4 px): đây là 4 px dư thấy ở 1920. Nay `overflow: visible`; sổ từ vẫn tự co và cuộn, khung nằm gọn trong màn ở 1280 và 1920.
  - Nhãn `Bạch Long` (57 px ở sàn 11 px) rộng hơn cột 46 px của khung rồng ở 720p và lấn ô ⌥1. Cột nay là `minmax(58px × ui, max-content)` và khung có `min-width: max-content`: ở 1280 khung rộng thêm 9 px, nhãn nằm gọn, hàng ô kỹ năng không đổi; ở 1920 không đổi gì.

