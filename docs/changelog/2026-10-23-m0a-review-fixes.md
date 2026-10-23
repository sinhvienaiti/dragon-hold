# 23/10/2026 · M0a: sửa theo đợt rà soát

Sửa theo báo cáo rà soát của bước ráp M0a, gồm luật và cân bằng, học, UI, hình, âm thanh, hiệu năng. Mỗi mục ghi đã sửa hay chưa, và lý do nếu chưa sửa.

## Kit

- Thêm module `balance` vào `kit.config.json`, chép lại kit theo commit cha `623b1cdd` (73 file). Gồm hồ sơ kỹ năng, FlowMeter, PaceDirector, bot gõ giống người, cổng B1–B9. `verify-kit` xanh. Không sửa tay file nào trong `src/kit`.

## Luật và cân bằng

- **[cao] G1 trượt vì không có áp lực (D23 thay D06).** Đã sửa theo BALANCE §9.1.
  - Nhịp `k` hai chiều 0,75–1,30. Tính từ `C(E_eff) / C_ref`, với `E_eff = E × (0,6 + 0,4a²) × (1 − 0,5CV)` và `C_ref` ≈ 19,6, nên bot chuẩn có k = 1 (`PACE`, `paceFor` trong `src/sim/world.ts`).
  - Vùng Chữ đổi sang thời gian tiếp cận `T_a` (5 s ở k = 1). Không bao giờ dưới 2 lần thời gian gõ một từ, và cộng thêm một lần cho mỗi W dư.
  - Áp lực liên tục "Héo lan" (`PRESSURE`): cứ 2 s, quái đứng trong Vùng Chữ, hoặc ở trong Vòng Nguy 10 m, làm Hỏa Long mất máu theo W của nó. Có sự kiện `blight` và hiệu ứng làn khói héo.
  - Bộ điều nhịp trong sim (`src/sim/director.ts`): đọc FlowMeter mỗi tick, mỗi 5 s chỉnh tối đa một bậc, tối đa 2 bậc mỗi đợt. Hai đòn bẩy: khoảng sinh ±7 % (trần ±15 %), và khi gần thua thì thả một Bình Máu, nhưng chỉ cho người vừa gõ trong 20 s. Mỗi đợt có sàn riêng, để kế hoạch bị nén không vượt đỉnh 1,35. Mọi trạng thái là số nguyên, phát lại vẫn ra đúng mã băm.
  - Máu Hỏa Long cấp 1 đặt 460 để bot chuẩn giữ được biên máu. Đây là số chỉnh theo D23, khác số khởi điểm 1000 của 01 §2.2.
  - Bộ bot mới theo BALANCE §6: trẻ em, mới, chậm chắc, khá, ẩu, nhanh, cùng các biến thể B6 và B7. Báo cáo in thêm S, P, I, O, N, Q, số bậc nhịp và cổng B1–B9.
  - Kết quả với 20 seed: G1 85 % thắng (đạt), G3 100 %, G5 0 %, G6 thua 20/20 trước hết đợt 3, G9 1,39.
- **[cao] Thiên Hỏa quét sạch cụm bầy.** Đã sửa. Mỗi đòn vùng (Thiên Hỏa, Phun Lửa) chỉ lấy tối đa 60 % máu của một cụm (`AREA.clusterCapPct`). Báo cáo in phần sát thương của từng kỹ năng. Với bot chuẩn: Thiên Hỏa 8,7 %, Phun Lửa 0,2 %, cả hai dưới trần 15 %.
- **[trung bình] G9 báo đạt sai.** Đã sửa.
  - G9 giờ lấy giá trị lớn nhất của các cửa sổ 6, 8 và 10 s. Bảng kế hoạch so với trần canon (đợt giữa 1,15, trần cứng 1,40).
  - Kế hoạch 10 đợt viết lại: đợt 1–9 có đỉnh ≤ 1,13. Đàn sói cách nhau 3 s (2,2 s ở đợt 10).
  - Đỉnh đo được lớn nhất là 1,388.
  - Còn lại: đỉnh 1,38 của đợt 10 vượt L_đỉnh 1,15 của C2. Đây là ngoại lệ M0 (≤ 1,40) theo DESIGN §9, cần chủ dự án ghi vào 00.
- **[trung bình] Vàng ải phồng vì hệ số 1,8.** Đã sửa. Bỏ `goldTypePct`, ải thường 2 đường về 1.325 Vàng. Báo cáo thêm phép kiểm G13b: vàng phủ 30,1 % phần dựng tối đa, trong dải 15–35 %. Báo cáo cũng ghi rõ thời điểm đo vàng dư.
- **[trung bình] Nhà Thuốc Lá hồi máu lúc nghỉ.** Đã sửa.
  - Nhà chỉ hồi trong đợt.
  - Mọi nhà đập chung một nhịp mỗi giây. Đồng minh ở trong tầm nhiều nhà chỉ nhận mức hồi mạnh nhất (03 §8: hào quang cùng loại không cộng).
  - Mức hồi chỉnh về 0,3 %/s.
- **[trung bình] Từ cụm bị chia lại rồi biến mất.** Đã sửa. `assign()` không chia từ cho cụm còn đòn đang bay hoặc đang chờ nhịp (`nextAt`).
- **[thấp] Đòn của từ cụm mất trắng.** Đã sửa. Nếu con mang chữ chết trước khi đòn chạm, đòn vẫn đánh vào các con còn sống cùng cụm quanh điểm chạm.
- **[thấp] Cháy từ hai nguồn gộp sai.** Đã sửa. Mỗi nguồn (`by`) có entry cháy riêng, nên số cháy và phần sát thương ghi đúng nguồn.
- **[thấp] Độ dài từ không theo D1/D4.** Đã sửa. Ấn Phá và từ cuối của tướng dùng cột Từ Khẩn (D4). Cờ và cụm dùng dải D1 (`lengthSlotFor`, `isD1Kind`).
- **[thấp] Thành phần quái lệch dòng C2.** Đã sửa. Còn 220 con, kiến chiếm 35,5 % (C2 ghi 40 %). Bỏ trần quái sống 30 riêng của ải, về mức 20 của C2. Đo được tối đa 12 quái sống.
- **[thấp] Esc xóa số lỗi của từ.** Đã sửa trong sim của game, không sửa kit. Nhả khóa bằng Esc giờ giữ số lỗi như Backspace, cho tới khi từ xong hoặc mất. Một lần gõ sai không còn được gửi là "correct".
  - Nên ghi luật này vào 01 §3.3. Kit router vẫn đặt lỗi về 0, nên cần thống nhất ở `shared/game-kit` sau.
- **[thấp] G15 bị chặn bằng mã.** Đã sửa. Bỏ guard trong `hardTicks`, nên G15 đo khống chế thật: tệ nhất 22,6 %, dưới trần 35 %.
- **[thấp] Nguồn vàng "khác" không có trần.** Đã sửa. Vàng gọi sớm bị giới hạn bởi phần còn lại của quỹ 15 % (`callEarlyRoom`). Thưởng học giữ trần riêng.
- **[thấp] Đích mặc định của Thiên Hỏa ngoài Vùng Chữ.** Đã sửa. Đích mặc định chỉ lấy quái trong Vùng Chữ. Không có đích thì lệnh bị từ chối (xem phần Hình).
- **Thêm (B8, G12):** bot nhanh có 1/20 lượt gặp một từ mới chỉ một lần. Giờ một từ mới đã gặp một lần được quay lại ở mọi độ dài không quá đầu trên của dải. Không đưa từ mới tinh vào khi toán cuối của đợt cuối đã ra cổng. B8 giờ đạt.

## Học

- **[cao] Thẻ Ôn lộ đáp án.** Đã sửa. Khi Thẻ Ôn hoặc Học trước mở thì khung học bị che. Thẻ ghim bị xóa lúc hết đợt. `dh-learning-frame` kiểm thêm: lúc thẻ hỏi, chữ hiện trên khung học không chứa đáp án.
- **[cao] Gõ chép ở Học trước được tính là nhớ đúng.** Đã sửa. Học trước gửi `hintUsed: true`, và `recalls` chỉ tăng khi đúng mà không có gợi ý. Có test: chép, một lần Thẻ Ôn đúng và hai lần hạ quái vẫn dưới độ thuộc 70.
  - Cần báo chủ canon: 01 §6.6 xếp Học trước vào "review-card".
- **[thấp] Học trước tự nộp, chữ sai hiện xanh, một lần Esc đóng cả 8 từ.** Đã sửa.
  - Gõ đúng thì đi tiếp ngay. Gõ sai thì chữ hiện hồng và chờ Backspace hoặc Enter.
  - Esc bỏ từ đang hiện, Esc 2 lần thì bỏ hết. Nhãn ghi đúng như vậy.

## UI

- **[trung bình] Menu dừng không che chữ.** Đã sửa. Lớp che phủ thẻ chữ và khung học lúc menu mở và lúc đếm 3-2-1.
- **[trung bình] Dòng nghĩa trên thẻ chữ 12,16 px ở 720p.** Đã sửa. Cỡ chữ có sàn 13 px. `dh-words` đo thêm dòng nghĩa: 13 px ở 720p, 15,2 px ở 1080p.
- **[trung bình] Chữ HUD 6,8–10,4 px ở 720p.** Đã sửa. Chữ phụ, nhãn phím, huy hiệu "Mới" có sàn 11 px. Dòng Vừa học ≥ 12 px.
- **[thấp] Thẻ Ôn che bệ và ô đặt.** Đã sửa phần che: thẻ gọn, nằm ngay dưới thẻ đợt.
  - Chưa sửa: phím số của cửa hàng vẫn khóa khi thẻ mở, vì Enter vừa nộp thẻ vừa xác nhận chỗ đặt. Esc đóng thẻ bằng một phím.
- **[thấp] Backspace và Esc xử lý lỗi khác nhau.** Đã thống nhất trong game: cả hai giữ lỗi (xem mục Esc ở trên). Chưa đổi kit.
- **[thấp] Phím gõ lúc 3-2-1 bị nuốt mà chữ vẫn hiện.** Đã sửa. Lớp che giấu thẻ chữ suốt lúc đếm, nên không còn chữ để gõ nhầm.
- **[thấp] Phím số mua ngay đồ tiêu hao.** Đã sửa. Lần bấm đầu chỉ chọn món và hiện giá ("Bấm 6 lần nữa để mua…"). Lần bấm thứ hai mới mua, giống cách bán.
- **[thấp] Chữ vặt gây hiểu nhầm.** Đã sửa.
  - Tiêu đề dùng số lining.
  - Lúc nghỉ, HUD ghi "Nghỉ trước đợt N" và giá gọi sớm.
  - Chữ chờ của khung học đổi theo pha.
  - Thẻ đợt ghi tên ngắn của quái cạnh icon, ví dụ "Kiến ×6". Rê chuột thì thấy tên đầy đủ.

## Hình

- **[cao] "Chơi lại ải" rò khoảng 89 MB GPU và đứng hình khoảng 0,6 s.** Đã sửa.
  - Hai Rồng giữ qua các lượt và chỉ reset trạng thái. GLB không tải lại.
  - Khi dispose thì dispose cả texture và skeleton.
  - Lượt mới dựng xong rồi lượt cũ mới bỏ. Cảnh 3D của lượt cũ rời sân khấu ngay, nhưng đến lần chơi lại sau mới dispose. Nhờ vậy chương trình shader vẫn còn trong cache, không phải link lại.
  - Đo trên Chrome không khóa vsync, 5 lần chơi lại: texture giữ 19, chương trình giữ 48. Khung dài nhất sau khi chơi lại giảm từ 338 ms xuống 14–21 ms.
  - `dh-restart` kiểm thêm số texture, số chương trình và khung dài nhất.
- **[trung bình] Vệ Binh Rêu giống Yêu Rêu Lính.** Đã sửa. Lính phe ta có màu riêng và đĩa chân lam (`UNIT_DISC`).
- **[trung bình] Thiên Hỏa rơi vào Bệ Rồng khi không có quái.** Đã sửa. Lệnh bị từ chối với lý do `no-target`, không tính hồi chiêu, HUD báo "Không có mục tiêu".
- **[trung bình] Hiệu ứng đòn quá nhỏ ở camera chơi, thiếu dải chữ cái.** Đã sửa.
  - Cỡ hiệu ứng nhân theo khoảng cách camera: đầu đạn khoảng 28 px, vụ nổ khoảng 60 px ở 1080p. Vòng trên mặt đất chỉ to theo √k.
  - Lửa đậm hơn.
  - Gõ xong một từ thì có tia chữ cái bay từ thẻ.
- **[trung bình] Không thấy hiệu ứng của Lưới Phóng và Nhà Thuốc Lá.** Đã sửa.
  - Tầm Lưới Phóng 11 m, với tới cuối đường trời từ ô `cau-t4`.
  - Mỗi nhịp hồi phát sự kiện `heal`, kèm giọt sáng bay tới đồng minh.
- **[trung bình] Chưa đo được cổng hiệu năng đám đông có xương.** Chưa sửa.
  - Cần GLB có xương của chủ dự án và chế độ `bones` hoặc `vat` của M0b. Luật dự án cấm dựng mô hình sinh vật bằng code.
  - Game thật ở 1080p High, Chrome không khóa vsync, đợt 1–10: khung trung bình 3,9–4,1 ms, p95 ≤ 6,8 ms, khung dài nhất 18 ms, 26–30 draw call.
- **[thấp] Thiếu báo trước đỏ cho E09 và E01; vạch sói bị thẻ che.** Đã sửa.
  - E09 có cung đỏ 0,5 s, E01 có vòng đỏ 0,5 s.
  - Vạch vồ của sói rộng 1,4 m.
  - `dh-telegraphs` chụp cả 6 loài. Sói xuất hiện ở đợt 7 trên Đường Cầu, nên kịch bản đặt lính chặn ở `cau-b2`.
- **[thấp] Khe nứt hình chữ "M".** Đã sửa. Pha nhiễu lấy theo từng instance.
- **[thấp] Hai Rồng chồng nhau; bom và gai quá nhỏ, quá tối.** Đã sửa. Bạch Long dời tới (−2,6; 2,0). Bom và gai tạm sáng hơn và to hơn.
- **[thấp] Số đo GPU của bench vô lý.** Đã sửa. Bench gắn nhãn số GPU là không tin cậy trên ANGLE/Metal. Chỉ dùng khoảng cách giữa các khung khi Chrome không khóa vsync.

## Âm thanh

- **[thấp] Tiếng nổ chỉ nhỏ đi 3 dB khi phát âm từ.** Đã sửa. Đạn, trúng đòn và nổ đi qua bus `world`, hạ 6 dB khi phát âm. Tiếng gầm và giọng Rồng vẫn hạ 3 dB.

## Còn lại, cần chủ dự án

- **B1:** S và I lệch dải Cân bằng. Bot chuẩn có S 21 %, dưới mức 35 %. I của mọi bot là 23–47 %, trên mức 10 %. Muốn I ≤ 10 % thì tải trung bình phải gần 1,0, vượt dải L 0,6–1,25 của 00 §4.4. Hai tài liệu cần thống nhất.
- **B7:** khi tắt bộ điều nhịp, bot chuẩn vẫn thắng 95 %. B6 cũng chưa tách được chiến thuật tốt với kém ở chế độ Cân bằng.
- **B3, B5, B9:** thiếu số vì M0 chưa có chế độ Thư giãn và Thử thách, và chưa có buổi chơi thử với người thật.
- **G16:** chưa đạt (188 s), nhưng cổng này chỉ tính từ ải 15.
- **G5** chấm theo 00 §7 dòng "ải 21+", vì M0 chạy ở sức C2. Cùng số ≤ 40 % với DESIGN §9.

## Kiểm

- `npx tsc --noEmit`, `npx vitest run` (321 test), `pnpm build`, `node src/kit/verify-kit.mjs`: đều xanh.
- `pnpm dh:balance` (15 bot × 20 seed): G1, G3, G5, G6, G9, G8, G13, G13b, G15 và B2, B4, B8 đạt.
- Cổng 3005, `--strictPort`, 0 lỗi console, 0 tải hỏng:
  - `dh-smoke`, `dh-words`, `dh-learning-frame`, `dh-hitstop-keys`: 114/114 phím, trễ tối đa 19 ms.
  - `dh-placement`, `dh-focus`, `dh-keyboard-only`: thắng 3 sao, phát lại ra cùng mã băm.
  - `dh-telegraphs`, `dh-restart`, `dh-camera`, `dh-scale`, `dh-perf`.
- Ảnh ở `tmp/shots/fixer/` (không vào Git), đã mở xem.
