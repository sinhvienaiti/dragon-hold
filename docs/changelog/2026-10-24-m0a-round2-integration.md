# 24/10/2026 · M0a vòng 2: ghép ba làn (cân bằng, hình, kit và học)

Bước ghép trước khi chạy kiểm. Ba làn đã tự commit lên `main` của `games/dragon-hold`. Bước này kiểm chỗ các làn chạm nhau (dữ liệu sim, view, kit và học), sửa một chỗ nhỏ, ghi lại sở hữu file và các mục còn mở trong `LANES.md`. Không chạy bộ kiểm trình duyệt và bộ bot dài: bốn người kiểm chạy ngay sau bước này.

## Ba làn đã ghép

| Làn | Commit | Changelog |
|---|---|---|
| Kit và học | kit `339e6dac` (repo cha), `0c8e0c7` (chép kit), `e9f7242`, `a234c74` | `2026-10-23-m0a-kit-learning.md` |
| Cân bằng | `89b4aca` | `2026-10-23-m0a-balance.md` |
| Dễ đọc và hình | `0273afa`, `f720737`, `59e268b` | `2026-10-23-m0a-round2-visuals.md`, `2026-10-24-m0a-round2-readability.md` |

Thứ tự trên `main`: kit, rồi Esc và học (`e9f7242`), rồi cân bằng (`89b4aca`), rồi hình. Không có đoạn nào bị đè.

## Chỗ các làn chạm nhau, đã kiểm

- **`src/sim/words.ts`:** làn kit và học sửa `releaseLock` (bỏ đoạn tự lưu rồi ghi lại số lỗi, nay kit giữ lỗi qua `unlockErrors: "keep"`). Làn cân bằng chỉ sửa `chainWords` (quái Nhỏ mang một từ). Hai chỗ khác hàm, cả hai còn nguyên.
- **Golden:** làn cân bằng ghi lại `tests/golden/m0.json` trên cây có thay đổi Esc chưa commit, và có ghi chú "phải commit cùng nhau". Nay cả hai đã vào `main`. `tsx scripts/balance/golden.ts` (chỉ kiểm) báo "giữ nguyên" cho cả `b35-seed1` và `noTyping-seed2`, nên không cần ghi lại golden.
- **`scripts/balance/calibrate.ts`:** bot hiệu chỉnh vẫn dùng luật Esc "keep" của làn kit và học. Làn cân bằng không sửa file này.
- **Luật cân bằng và phần hình:** làn cân bằng bỏ `PRESSURE.zonePerW10` và `ringPerW10`. Không file view, UI hay âm thanh nào đọc hai số này. Sự kiện `blight` giữ dạng cũ (`amount`, `from`), `src/view/fx.ts` vẫn vẽ khói Héo từ `from`.
- **Độ khó và bộ điều nhịp:** `?difficulty=` của app đi vào `createWorld`, rồi `createDirector(on, stage, difficulty)`. Dễ, Thường, Khó dùng dải Thư giãn, Cân bằng, Thử thách (`BAND_MODE`).
- **Hình đo trên bản cân bằng mới:** làn hình đo lại mọi mục trên `89b4aca` (đợt dày hơn). `__dh.foeSizes()` đọc cỡ vẽ thật từ `src/view/foe-look.ts` (`f720737`).
- **Kit:** `node scripts/sync-game-kit.mjs --check` ở repo cha báo OK cho cả ba game. Chỉ `dragon-hold` dùng module `typing/` của kit, nên chỉ chép lại kit vào `dragon-hold`.

## Sửa khi ghép

- `src/app/app.ts`: điều kiện tua nhanh (Alt + →) đọc vùng chữ từ `RINGS.wordZoneMm` (01 §2.1) thay cho số 26 viết tay. Giá trị không đổi (26 m). Sim không đổi, golden không đổi.
- `LANES.md`: mục "Round 2 integration" ghi các hợp đồng mới (kit `unlockErrors`, `isRightRecall`, `BAND_MODE`, `foeDrawnSize`, `screen-zones`, `drawnWarnings`), chủ của các file mới, và file của làn khác đã sửa trong vòng 2. Mục "Open items after round 2" thay danh sách cũ. Bỏ hai mục đã sửa ở `59e268b` (Thiên Hỏa nổ đọc yếu, thẻ chữ che đám đông ở đầu cầu) và tham chiếu tới một báo cáo cổng chưa có.

## Mục rà soát của bước cổng trước, tình trạng sau khi ghép

| Mục | Tình trạng | Ở đâu |
|---|---|---|
| Esc giữ số lỗi trong game nhưng kit đặt về 0 | Đã sửa: kit `RouterRules.unlockErrors`, game đặt "keep" | `339e6dac`, `0c8e0c7`, `e9f7242` |
| Học trước gửi `hintUsed: true`, 01 §6.6 xếp là `review-card` | Đã sửa chỗ lệch thật: `isRightRecall` không đếm câu có `hintUsed` là lần nhớ, cả trên máy lẫn mẫu đọc từ portal | `e9f7242` |
| Quái giữ chỗ ~28 px ở 1080p, xanh đậm trên cỏ | Đã sửa: trung vị lính 42 px ở 1080p, màu họ, viền, rim | `0273afa` |
| Vạch báo trước nhỏ | Đã sửa: báo trước to, đỏ, có huy hiệu "!", thấy xuyên thân | `0273afa`, `59e268b` |
| Bạch Long ra màu nâu đỏ | Đã sửa: thân trắng, cánh lông đỏ cam | `0273afa` |
| Thẻ đợt che đường cầu phía bắc ở 720p | Đã sửa: che 0 px | `0273afa` |
| "+Vàng" chồng số Vàng | Đã sửa: 0 px² | `0273afa` |
| Thẻ Ôn che mép ô đặt ở 1080p | Đã sửa: 0 px² | `0273afa` |
| Trận thưa (7–12 quái sống) | Đợt dày hơn, 266 quái, chữ đầu đợt sau khoảng 2–3 s | `89b4aca` |
| B3, B5 thiếu số | Có số, đạt: Mới 78 %, trẻ em 98 % ở Thư giãn; bot không gõ thua 100 % | `89b4aca` |
| B6 (chiến thuật tốt và kém đều thắng 100 %) | Đạt: 85 % và 48 % ở Cân bằng | `89b4aca` |
| B1 (S 21 %, I 23–47 %) | Còn trượt: S chuẩn 57 % đã vào dải, I vẫn 16–35 % | `89b4aca`, cần anh quyết |
| B7 (tắt bộ điều nhịp vẫn thắng 95 %) | Còn trượt: tắt bộ điều nhịp thắng 80 %, I 22 % | `89b4aca`, cần anh quyết |
| B9 | Chưa có số, cần anh chơi thử | |

## Kiểm

| Kiểm | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `npx vitest run` | 349/349 (41 file), có golden |
| `node src/kit/verify-kit.mjs` | 73 file khớp (kit tại `339e6dac`) |
| `pnpm --dir shared/game-kit exec vitest run` (repo cha) | 275/275 (36 file) |
| `node scripts/sync-game-kit.mjs --check` (repo cha) | `dragon-hold`, `typing-defense`, `typing-survival` đều OK |
| `tsx scripts/balance/golden.ts` | "giữ nguyên" cả hai ca |
| `vite build` (ra thư mục tạm) | xanh |

Chưa chạy: kịch bản trình duyệt `dh-*` và bộ bot đầy đủ (`pnpm dh:balance`). Bốn người kiểm chạy ngay sau bước này.

## Còn mở, cần anh quyết

1. **Nhàn I (B1, B7).** Bot chuẩn nhàn 21 %, tắt bộ điều nhịp 22 %, dải ≤ 10 %. Trần tải 00 §4.4 cộng khoảng 46 % sát thương không do gõ để lại tốt nhất 15–19 %. Chọn một trong bốn: (a) chỉ tính khoảng nhàn ≥ 1 s, hoặc tính 0,2 s đòn bay là bận (đổi FlowMeter của kit); (b) dải I riêng ≤ 20 % ở Cân bằng cho Rồng Giữ Ải; (c) tải đợt giữa 1,05–1,10, đỉnh ≤ 1,25, đợt 1 tới 0,75; (d) giảm phần sát thương không do gõ còn 20–25 %.
2. **Bot Nhanh thắng 100 %** (trần k 1,30). Q khoảng 40 % (§9.1 muốn 55–70 %).
3. **Số mới cần ghi vào 00 §4.10 và §9.1:** biên thời gian theo Ẩu và CV, Héo lan theo chế độ, đỉnh đợt 10 là 1,39 (ngoại lệ M0 ≤ 1,40). Câu đề xuất cho 01 §3.3 (Esc) và 01 §6.3, §6.6 (Học trước không tính là lần nhớ) nằm trong `2026-10-23-m0a-kit-learning.md`.
4. **Esc rồi khóa lại:** từ đã Esc mà còn lỗi cũ thì không đổi khóa mềm được. Đây là hành vi của kit. Muốn đổi phải thêm trạng thái vào sim và ghi lại golden.
5. **Thẻ vòng quanh bệ** đứng ở chỗ cố định (05 §4.3), nên có thể che một phần vòng báo trước của quái sát bệ. Quái sau lính chặn chỉ hiện thành bóng sọc, vì Vệ Binh Rêu giữ chỗ vẽ × 2. Model thật ở M0b sẽ quyết tỉ lệ.
