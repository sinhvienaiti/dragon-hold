# 23/10/2026 · M0a vòng 2: dễ đọc và hình

Làn "dễ đọc và hình" của vòng 2, sửa các mục hình trong báo cáo cổng `2026-10-23-m0a.md` (phần "Nhận xét hình"). Chỉ đụng `src/view/**`, `src/ui/**`, các kịch bản `dh-*` và test của view, UI. Không đổi luật: sim, typing, content giữ nguyên, mã băm và golden không đổi vì phần này.

## Mục rà soát đã sửa

- **Quái tạm quá nhỏ, xanh rêu sẫm trên cỏ xanh.** Đã sửa (`src/view/foe-look.ts`, `crowd.ts`, `actors.ts`).
  - Cỡ vẽ theo bậc, chỉ ở phần hình: nhỏ × 2,25 (trước là 1,4 cho mọi quái), vừa × 2,15 (heo vốn đã to), tướng × 2,2, bầy × 1,5. Sim giữ nguyên cỡ, tầm và vị trí.
  - Màu theo họ, sáng hơn và đậm hơn màu content: rêu thành vàng ô liu úa (khác cỏ tươi), thú nâu gỉ, bọ tím lam. Màu xám tro chỉ còn 14 % (trước 38 %).
  - Viền tối quanh thân (vỏ lật mặt sau, khoảng 2 px ở 1080p dù zoom thế nào), viền sáng theo màu họ, bóng tiếp đất tối và gọn hơn.
  - Quái bay: dưới đất có chấm tối và vòng tròn, cùng một dây nét đứt nối lên thân, nên nhìn là biết đang bay.
  - Bầy kiến: thân nhỏ, xếp xoắn ốc quanh tâm cụm (chỉ ở phần hình), có vòng màu họ viền tối bao cả cụm.
  - Tướng: viền đậm hơn, viền sáng mạnh hơn.
  - Thẻ chữ, thanh máu, hiệu ứng đòn đều theo chiều cao vẽ mới. Lính ta (Vệ Binh Rêu) vẽ × 2, đĩa xanh dưới chân rộng 2,3 m.
- **Vạch báo trước nhỏ.** Đã sửa (`src/view/telegraphs.ts`). Vẫn màu đỏ #FF4A4A.
  - Cỡ vẽ tối thiểu (tầm của sim không đổi): vòng bán kính 2,2 m, vạch rộng 2 m và dài ít nhất 3 m, quạt bán kính 3,2 m.
  - Mép đỏ dày 0,24 m, thêm mép ngoài đỏ thẫm để nổi trên đất, cỏ, nước. Phần tô đậm hơn, nhấp nháy ở một phần ba cuối. Vạch có đầu mũi tên.
  - Huy hiệu "!" đỏ cạnh thân con quái đang vung đòn, tắt khi đòn rơi.
  - Báo trước của ta (Thiên Hỏa) giữ cam nhạt viền trắng, không có mép đỏ thẫm.
- **Bạch Long ra màu đỏ nâu.** Đã tìm ra nguyên nhân và sửa (`src/view/heroes.ts`).
  - Không phải sai file: `draconis-v4.high.glb` và `.medium.glb` trùng sha256 với bản của Space. Bốn texture WebP nạp đủ, ảnh màu ở sRGB, kim loại gần 0, tầm chất lượng `.high` đúng.
  - Nguyên nhân: màn tiêu đề của Space chiếu rồng bằng môi trường phòng studio (`RoomEnvironment`, PMREM). Cảnh trận không có môi trường. Thân trắng thành tím xám đục, còn cánh đỏ và giáp chân tối chiếm phần lớn hình khi chỉ cao khoảng 60 px và nhìn từ trên xuống.
  - Sửa: chỉ vật liệu của Bạch Long nhận môi trường studio đó (cường độ 1,15), cảnh vẫn không có. Rồng quay mặt về camera mặc định, nghiêng 0,22 rad về phía bệ, cao 4 m (trước 3 m). Ảnh cận cho thấy rồng trắng, cánh lông đỏ cam, giống màn tiêu đề của Space.
- **Thẻ đợt che lối bắc của Đường Cầu ở 720p.** Đã sửa (`src/ui/screen-zones.ts`, `wave-card.ts`, `placement-ui.ts`).
  - `placement-ui` đăng các vùng trên màn hình mỗi khung: đường đất, Đường Trời và mọi ô đặt, chiếu qua camera thật.
  - Thẻ đợt chọn chỗ đầu tiên không che đường, ô đặt hay bảng HUD, theo thứ tự: góc trái dưới HUD, góc phải, giữa trên, hai bên. Đã có chỗ trống thì giữ, không nhảy. Camera xoay thì thẻ tự đổi chỗ.
  - Băng rôn đầu đợt (1,2 s) cũng tránh lối bắc, nơi quái vừa vào.
  - "Đường Trời" không còn xuống hai dòng.
- **Số "+Vàng" đè số Vàng.** Đã sửa (`src/ui/styles/dh.css`). Số thay đổi nằm trong một ô riêng ngay bên phải số Vàng, chỉ trôi nhẹ lên. Bảng HUD rộng thêm (364 × ui) để có chỗ.
- **Thẻ Ôn che mép ô đặt ở 1080p.** Đã sửa (`src/ui/learning-frame.ts`). Khi mở, Thẻ Ôn chọn chỗ mỗi khung, không che ô đặt, đường, HUD hay thẻ đợt. Không có vùng (trang xem thử UI) thì giữ chỗ cũ ở giữa trên.

## Khác

- Lớp đám đông dựng sẵn cho mọi hình khối, còn báo trước và huy hiệu "!" được biên dịch shader từ đầu. Nhờ vậy con quái hay đòn đầu tiên của đợt không làm khựng khung hình.
- `bench.ts` vẽ quái giống hệt trong game (cùng màu, cỡ, viền), nên bench đo đúng chi phí mới.
- Kịch bản:
  - `dh-scale` viết lại: đo cỡ vẽ thật, gồm chiều cao từ chân tới đầu và chiều dài thân theo hướng đi. Bot gõ hết từ tới đợt 4, sau đó chỉ gõ quái trong 13 m, để các loài đi khắp bản đồ. Có `SIZE=1280`, dải tính lại theo tỉ lệ 720/1080.
  - `dh-telegraphs` có `SIZE=1920`.
  - `dh-placement` báo phần đường và ô đặt dưới thẻ đợt, cùng diện tích chồng giữa số thay đổi và số Vàng.
  - `dh-learning-frame` chạy Thẻ Ôn ở cả hai cỡ, báo phần đường và ô đặt dưới thẻ.
- Test: `tests/view/view-crowd-fx-crowd.test.ts` (vỏ viền, cỡ và kiểu vẽ theo con, dấu cho quái bay và vòng bầy, cỡ theo bậc, xoắn ốc bầy) và `tests/ui/screen-zones.test.ts` (cắt đoạn đường, chọn chỗ, vùng của L2-cau).

## Số đo

Mac Apple M4, Chrome 155, cổng 3005 (Vite không HMR, để làn khác sửa file không nạp lại trang giữa kịch bản), mỗi lần một Chrome. Ảnh ở `tmp/shots/round2/`, số ở `tmp/round2/results/` (không vào Git). Đã mở xem ảnh trước và sau ở cả hai cỡ.

| Kiểm | Trước | Sau |
|---|---|---|
| `dh-scale` 1080p, trung vị px (dải mới) | E09 28 px | E09 42 (≥ 40), E11 45, E01 46, E19 54, G01 64 (≥ 60); E25 30 px một con, vòng cụm 116 px |
| `dh-scale` 720p (dải × 720/1080) | — | E09 28 (≥ 27), E11 30, E01 31, E19 36, G01 43; vòng cụm 78 px |
| Bạch Long ở camera mặc định 1080p | cao 3 m | cao 4 m, trắng cánh đỏ cam, có môi trường studio |
| `dh-telegraphs` 720p và 1080p | vạch khoảng 30 px ở 720p | 5 loài báo trước, ngắn nhất 500 ms, G01 cắm cờ 2 lần, có huy hiệu "!" lúc ảnh chụp; 0 lỗi |
| `dh-placement` thẻ đợt lúc nghỉ | che lối bắc ở 720p | 720p và 1080p: đường dưới thẻ 0 px, ô đặt 0 px²; số thay đổi chồng số Vàng 0 px²; mua đủ phím 6, 7, 8 |
| `dh-learning-frame` Thẻ Ôn | che mép ô đặt ở 1080p | 720p và 1080p: đường 0 px, ô đặt 0 px², không lộ đáp án, đồng hồ đứng, +30 Vàng; thẻ chữ và số sát thương không che khung học |
| `dh-words` 720p, 1080p × cỡ thẻ 100 %, 150 % | — | 0 thẻ chồng, 0 thiếu, chữ nhỏ nhất 16 px (720p) và 20 px (1080p), phát lại khớp mã băm 4/4, phím tới khung tối đa 19,6–27 ms |
| `dh-camera` 3 góc × 4 hướng, hai cỡ | — | 12 ảnh mỗi cỡ, 0 tải hỏng |
| `dh-perf` 1080p High, đợt 1–5 | TB 3,9–4,2 ms, p95 4,9–7,5 ms | TB 4,6–4,9 ms, p95 5,9–6,4 ms, 29 draw call (máy đang chạy cả workflow âm thanh) |
| `dh-bench` 220 quái 1080p High, nền vẽ | TB 1,68 ms, 18 draw call | TB 4,1 ms, p95 5,0 ms, 39 draw call (lần trước đo trên nền phẳng) |
| Test | — | `tests/view`, `tests/ui`: 64/64 xanh; `tsc` 0 lỗi; `verify-kit` 73 file khớp |

Sói (E18) không vào khung đo của `dh-scale` vì chỉ ra từ đợt 7. Theo cỡ vẽ, thân dài 2,9 m, khoảng 46 px ở 1080p. `dh-telegraphs` có chụp sói vồ.

Bộ test đầy đủ lúc chạy cuối: 331/338 xanh. 7 ca đỏ đều thuộc golden replay (6) và `tests/sim/balance-pressure` (1), do làn cân bằng đang sửa sim song song. Phần này không đụng sim nên mã băm không đổi.

## Còn lại

- Thẻ chữ của quái thấp (heo, sói) ở đầu cầu đôi khi đè lên chính thân nó khi nhìn từ trên xuống. Thẻ neo trên đầu theo 05 §4.3. Chưa sửa ở vòng này.
- Màu họ là màu tạm của khối M0a. Model thật ở M0b sẽ quyết màu cuối.
