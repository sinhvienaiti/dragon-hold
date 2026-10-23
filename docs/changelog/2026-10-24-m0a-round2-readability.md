# 24/10/2026 · M0a vòng 2 (tiếp): thẻ chữ nhường đám đông và đòn báo trước, bóng xuyên, Thiên Hỏa rõ hơn

Làn "dễ đọc và hình" chạy tiếp sau khi lượt trước bị ngắt giữa chừng (hết hạn mức). Phần đã commit ở `0273afa` (xem `2026-10-23-m0a-round2-visuals.md`) giữ nguyên. Phần lượt trước làm dở, chưa commit (thẻ chữ tránh thân quái, Thiên Hỏa nổ rõ hơn), đã kiểm lại và giữ. Lượt này thêm bóng xuyên cho quái bị che, viền báo trước xuyên thân, và thẻ chữ tránh vùng báo trước. Tất cả được kiểm lại trên bản cân bằng mới (`89b4aca`, đợt dày hơn).

Chỉ đụng `src/view/**`, `src/ui/tags.ts`, test của view và UI. Không đổi sim, typing, content. Mã băm và golden không đổi vì phần này (phát lại khớp 4/4 trong `dh-words`).

## Mục rà soát đã sửa

- **Thẻ chữ che đám đông bị giữ ở đầu cầu** (mục mở sau vòng 2 trong `LANES.md`). Đã sửa (`src/ui/tags.ts`, `src/view/foe-look.ts`, `src/view/actors.ts`).
  - Mỗi khung, thẻ đọc hộp vẽ của mọi quái trên màn hình. Bầy kiến tính là một hộp quanh vòng cụm.
  - Thẻ tìm chỗ không che quá 20 % thân quái khác, trong cùng các nấc đẩy ngang và các hàng như cũ. Không có chỗ trống mới ngồi lên thân, như trước.
  - Thẻ đang trong 0,5 s giữ chỗ thì không nhảy (05 §4.3). Thẻ vòng quanh bệ và chip mép màn hình vẫn đứng ở chỗ cố định.
  - Thẻ đứng trên cả hộp vẽ của chính con quái. Heo và sói thân dài thấp, hay bầy kiến trải rộng, không còn bị thẻ của chính nó đè. Đây là mục "Còn lại" của vòng 2.
- **Thiên Hỏa nổ đọc yếu** (mục mở sau vòng 2). Đã sửa (`src/view/fx.ts`, `src/view/telegraphs.ts`).
  - Khối lửa rơi có lõi cam đậm, kéo theo vệt khói. Bóng của nó trên đích đậm dần và to dần khi rơi xuống (05 §6.1).
  - Lúc chạm đất có quả cầu lửa (lõi HDR vượt ngưỡng bloom), khói tối bốc lên, lửa liếm quanh mép, vòng sóng chạy ra đúng bán kính 4 m, bụi tỏa, đá văng, vết cháy đậm hơn.
  - Vùng ngắm của ta (cam nhạt viền trắng) tô nhạt còn một nửa, để quái bên dưới vẫn thấy.
- **Quái bị lính chặn che mất, vạch báo trước chìm dưới thân.** Mục mới, thấy khi xem ảnh `dh-telegraphs`. Sói bị Vệ Binh Rêu giữ ở cầu khuất hẳn sau lính, vạch vồ chỉ lộ mũi tên. Quạt chém của lính vào rồng thì chìm dưới thân rồng. Đã sửa (`src/view/crowd.ts`, `src/view/telegraphs.ts`, `src/view/actors.ts`).
  - **Bóng xuyên:** quái bị lính ta, nhà, cây hay rồng che thì hiện thành bóng màu họ, kẻ sọc chéo, viền sáng. Bóng chỉ vẽ phần bị vật không phải quái che: lớp của ta vẽ trước, rồi bóng, rồi thân quái. Quái đứng trước vẫn đè lên bóng, nên đám đông không rối. Phần thân lún dưới đất và quái đang tan thì không có bóng.
  - **Báo trước xuyên thân:** báo trước của địch vẽ thêm một lớp viền đỏ, mép tối và chút nền, chỉ ở phần bị thân che. Báo trước của ta và vòng hào quang tướng không có lớp này.
  - Lớp đám đông tách riêng phần của ta (lính, bẫy, nhà) vào các lớp `our-*`. Mỗi lớp quái có thêm một draw call cho bóng.
- **Thẻ chữ che vòng báo trước.** Mục mới: thẻ của ong che nửa vòng chích. Đã sửa (`src/view/telegraphs.ts`, `src/ui/tags.ts`). Mỗi khung, báo trước của địch công bố một vòng tròn bao quanh trên mặt đất (`drawnWarnings`). Thẻ chữ tránh vòng này theo cùng luật 20 % như thân quái.

## Kiểm lại các mục của vòng 2 trên bản cân bằng mới

| Mục | Kết quả hôm nay (720p và 1080p) |
|---|---|
| Quái tạm đủ to | `dh-scale` 1080p, trung vị: lính E09 42 px (thấp nhất 40), cung 46, ong 47, heo 53, tướng G01 64, vòng bầy kiến 116 px. 720p: 28, 30, 32, 36, vòng 80 px, đều trong dải × 720/1080. |
| Màu họ, viền, bóng, quái bay, bầy | Đã xem ảnh: thân vàng ô liu, nâu gỉ, tím lam, viền tối khoảng 2 px, bóng tiếp đất tối. Quái bay có chấm, vòng và dây nối dưới đất. Bầy kiến có vòng cụm. |
| Báo trước to và đỏ | `dh-telegraphs` ở cả hai cỡ: 5 loài báo trước, ngắn nhất 500 ms, G01 cắm cờ 2 lần, có huy hiệu "!", 0 lỗi. |
| Bạch Long trắng | Ảnh ở camera mặc định 1080p: thân trắng, cánh lông đỏ cam, giống màn tiêu đề của Space. |
| Thẻ đợt ở 720p | `dh-placement`: đường dưới thẻ 0 px, ô đặt 0 px² ở cả hai cỡ. Mua đủ 5 món và phím 6, 7, 8. |
| "+Vàng" | Chồng lên số Vàng 0 px² ở cả hai cỡ. |
| Thẻ Ôn | `dh-learning-frame`: đường 0 px, ô đặt 0 px² ở cả hai cỡ. Không lộ đáp án, đồng hồ đứng, +30 Vàng. |
| Thẻ chữ | `dh-words` 720p, 1080p × cỡ 100 %, 150 %: 0 chồng, 0 thiếu, chữ nhỏ nhất 16 px (720p), 20 px (1080p). Phát lại khớp mã băm 4/4. |
| Camera | `dh-camera` 3 góc × 4 hướng, hai cỡ: 24 ảnh, 0 tải hỏng. |

## Số đo

Mac Apple M4, Chrome 155, cổng 3005 (Vite không HMR), mỗi lần một Chrome. Đã mở xem ảnh trước và sau ở cả hai cỡ. Số ở `tmp/round2r/` (không vào Git), ảnh ở `tmp/shots/round2/` (17–27 là ảnh lượt này).

| Kiểm | Trước | Sau |
|---|---|---|
| Thẻ che đám đông ở đầu cầu (cùng seed, 3 lần đo, đợt 3), phần thân bị che trung bình | 720p: 29 %, 36 %, 64 %. 1080p: 20 %, 36 %, 29 % | 720p: 4 %, 4 %, 2 %. 1080p: 8 %, 3 %, 8 % |
| Số quái bị che ≥ 40 % mỗi lần đo | 720p: 2, 3, 5. 1080p: 1, 3, 2 | 0 ở mọi lần |
| Sói sau Vệ Binh Rêu (ảnh `17`) | khuất hẳn, vạch vồ chỉ lộ mũi tên | bóng sọc nâu gỉ trên lính, viền mũi tên đỏ chạy liền qua thân |
| Quạt chém vào rồng (ảnh `18`) | mép dưới quạt chìm dưới cánh | viền quạt khép kín trên thân rồng |
| `dh-perf` 1080p High, 10 đợt, bot gõ | TB 4,6–4,9 ms, p95 5,9–6,4 ms, 29 draw call (vòng 2, 5 đợt) | TB 4,0–4,9 ms, p95 4,8–8,5 ms, 30–32 draw call. Khung tệ nhất 40 ms, một lần ở đợt 2 |
| `dh-bench` 220 quái 1080p High, nền vẽ | TB 4,1 ms, p95 5,0 ms, 39 draw call | TB 4,4 ms, p95 5,3 ms, 40 draw call |
| Test | — | `tests/view`, `tests/ui` 72/72. Toàn bộ 349/349. `tsc` 0 lỗi. `verify-kit` 73 file khớp |

Ngân sách 1080p High (TB ≤ 8 ms, p95 ≤ 12 ms) vẫn đạt. Máy đang chạy thêm workflow âm thanh trong lúc đo.

## Kịch bản

- `scripts/visual/scenarios/dh-crowd.mjs` (mới, từ kịch bản nháp của lượt trước): đặt Vệ Binh Rêu ở cầu, để quái dồn ở đầu cầu từ đợt 3, đo phần thân quái bị thẻ chữ che 3 lần, rồi chụp 16 khung Thiên Hỏa quay chậm. `SIZE=1920` cho 1080p.

## Test mới

- `tests/ui/tags-bodies.test.ts`: thẻ rời khỏi thân quái khác, không rời vì thân của chính nó. Tường quái kín thì thẻ về chỗ cũ, vẫn không chồng nhau. Giữ chỗ trong 0,5 s. Thẻ vòng và chip không tránh. 20 thẻ giữa 40 thân xếp dưới 1 ms (lấy lần tốt nhất trong 5 lô, để máy bận không làm test đỏ).
- `tests/view/view-crowd-fx-crowd.test.ts`: lớp bóng dùng chung ma trận và số lượng với lớp quái. Lớp của ta không có bóng. Thứ tự vẽ: ta, rồi bóng, rồi quái. Bóng dùng phép thử độ sâu GREATER, không ghi độ sâu. Draw call tính cả bóng.
- `tests/view/view-crowd-fx-effects.test.ts`: báo trước của địch có lớp xuyên thân, dùng chung lưới và uniform. Của ta và hào quang thì không. Vòng bao gửi cho thẻ chữ đúng tâm và bán kính, xóa khi đòn rơi.

## Còn lại

- Thẻ vòng quanh bệ (quái trong 10 m) giữ chỗ cố định theo 05 §4.3, nên vẫn có thể che một phần vòng báo trước của quái sát bệ. Ảnh `26`: ong chích, thẻ che khoảng nửa vòng, huy hiệu "!" vẫn thấy. Muốn đổi thì cần quyết lại luật thẻ vòng.
- Quái sau lính chặn chỉ hiện thành bóng sọc, chưa thấy rõ hình con gì. Lý do là Vệ Binh Rêu vẽ × 2 nên cao hơn sói. Model thật ở M0b sẽ quyết tỉ lệ cuối.
- Bóng xuyên cũng hiện khi quái đi dưới tán cây gần cổng ra quân. Đây là chủ ý: người chơi thấy quái sắp ra.
