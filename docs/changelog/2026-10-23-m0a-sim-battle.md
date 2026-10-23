# 23/10/2026 · M0a: làn sim-battle (quái, tướng, đợt, sát thương)

Phần trận của mốc M0a. Sim chạy được trọn 10 đợt trên bản đồ `L2-cau`.

## Đã làm

- **Sáu loài M0 (02 §2.2):**
  - E09 đi tới Vòng Cận rồi chém Hỏa Long. Nếu bị chặn thì chém lính.
  - E11 dừng ở dải bắn 12 m. Lính áp sát thì lùi 2 m rồi bắn. Tên Lửa làm bẫy phải nạp thêm 3 s.
  - E18 đi bầy 3 con, đủ 3 con trong 6 m thì nhanh thêm 15 %. Nó vồ qua một lính chặn: vạch đỏ 0,5 s rồi nhảy 3 m.
  - E19 cách mục tiêu 8 m thì cào đất 1 s sau vạch đỏ, rồi húc. Lính bị húc văng lùi. Sau cú húc nó choáng 1,5 s và nhận thêm 25 % sát thương. Đẩy lùi làm hỏng cú húc.
  - E01 bay đường trời cao 3 m, không bị chặn, dừng cách 10 m để chích. Khi bị Lưới Phóng kéo xuống thì đi dưới đất.
  - E25 ra cùng lúc thành một cụm, bám mép đường, đi chữ chi. Cả cụm dùng chung một từ.
- **Tướng G01:**
  - Hào quang Xung Phong +15 % tốc, bán kính 6 m. Có sự kiện bật, tắt vòng.
  - Ấn Phá tắt hào quang 8 s và làm tướng khựng 0,5 s. Câm cũng tắt hào quang.
  - Cắm Cờ: tướng đứng 1 s rồi cắm cờ. Cờ đứng 8 s, quân trong 5 m đánh mạnh thêm 25 %. Cờ có từ D1, gõ xong thì nhổ cờ. Bị choáng giữa lúc cắm thì hủy.
  - Khi tướng chết, quân trong 6 m chùn 1 s.
- **Bộ sinh đợt:** 10 đợt có nhóm quân thật. Tải đi từ 0,58 lên 1,28. Mỗi đợt có 2–3 đỉnh và quãng lặng.
  - Mỗi cổng sinh tối đa một nhóm mỗi 1,5 s. Hai đường sinh cách nhau ít nhất 0,6 s.
  - Đủ trần quái sống thì nhóm chờ ở cổng, đồng hồ đợt vẫn chạy.
  - Khoảng sinh giãn theo 1 / k_E cho người gõ chậm.
- **Nhịp ải:** Bày binh → Báo đợt 6 s → Đợt → Nghỉ 20 s (hai Rồng hồi 10 %) → … → Thắng có sao.
  - Gọi sớm cho 2 Vàng mỗi giây còn lại và +5 Long Nộ.
  - Mức Dễ chờ Enter. Hỏa Long hết máu thì thua.
- **Sát thương:**
  - Đòn chữ không bị giáp chặn. Đòn vật lý và phép của phe ta bị giáp, kháng chặn.
  - Đánh dấu và dễ tổn thương nhân với nhau. Phá giáp giảm nửa giáp.
  - Mỗi đòn gây ít nhất 1. Bảo hộ khóa giữ lại 1 máu cho quái đang bị gõ.
  - Quái Nhỏ luôn chết sau một từ không Ẩu.
  - Đòn rẽ sang quái có chữ gần nhất trong 4 m, còn 50 %.
- **Hỏa Long:**
  - Giáp 20, Kháng 20. Khiên đỡ trước.
  - Mất 4 % máu thì +1 Long Nộ. Có cấp Rồng, mỗi cấp +5 % máu.
  - Phun Lửa, Thiên Hỏa (vòng báo màu cam nhạt), Long Hống, Viêm Đế (tia dọc đường và nổ 7 m).
- **Phân tích kế hoạch đợt** trong `src/sim/waves.ts`: tải, đỉnh 8 s, nhịp nhóm, mối đe dọa theo đường. Cách đo giống `scripts/balance/load.ts`.

## Số cần biết

- Đỉnh tải đo bằng cửa sổ 8 s. Mỗi quái được tính là việc gõ ở nhịp 22,7 từ mỗi phút. Vì vậy một con đứng một mình không vượt 1,0.
- Một bầy 3 sói đo được 1,19, cao hơn trần 1,15 của đợt giữa. Vì vậy sói chỉ ra ở đợt 5 (tướng, trần 1,25), đợt 9 (1,25) và đợt 10 (1,40).
- Kế hoạch cũ ghi trần đỉnh 0,70 / 0,85 / 1,00 / 1,10 cho các đợt đầu. Nay dùng trần của 00 §4.4: đợt 1 là 1,00, đợt giữa là 1,15.
- Các số thiết kế chưa ghi nằm ở `rules.ts` mục `BATTLE`: cú nhảy 3 m, tốc húc 12 m/s, khoảng giãn quân, lúc cắm cờ. Bot có thể chỉnh các số này.

## Kiểm

- 51 test mới trong `tests/sim/battle-*.test.ts`: hành vi từng loài, hào quang bật tắt, cờ, tải đợt so với ngân sách, nhịp đỉnh và lặng, cổng sinh, trần quái sống, nhịp ải, sát thương, tất định, số nguyên.
- Toàn bộ vitest của game: 312/312 qua. `tsc --noEmit` không lỗi.
- Trình duyệt (cổng 3211): chạy trọn ải M0 trong Chrome, mã băm khớp Node (`c506f35a`). Ảnh sơ đồ ở `tmp/shots/sim-battle/`, đã xem. 0 lỗi console.
- Cả ải chạy khoảng 600 lần thời gian thực khi không có hình.
