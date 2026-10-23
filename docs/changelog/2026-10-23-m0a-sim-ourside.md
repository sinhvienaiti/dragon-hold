# M0a: luật phe ta (làn sim-ourside)

Ngày 23/10/2026. Làn sim-ourside viết xong phần luật thuần của phe ta cho M0a.

## Đã làm

- **Ô và luật đặt** (`src/sim/placement.ts`):
  - Đặt đúng loại ô, ô còn trống, có đủ Vàng, món có trong Bộ Mang Theo.
  - Tối đa 6 lính (03 §9.1).
  - C1–C5 chỉ đặt lúc Bày binh và lúc nghỉ đợt. Từ C6 được "đặt nhanh" 1 món mỗi đợt, dựng 2 s.
  - Ô chỉ hiện khi đang đặt hoặc lúc nghỉ, theo thứ tự phím mũi tên. Ô gợi ý đứng đầu.
- **Vàng** (`src/sim/economy.ts`):
  - Đầu ải 200. Ngân sách là 900 × f_đường × f_loại; bản thử M0 là 2.025.
  - Hạ quái trả 60 % ngân sách theo tỉ lệ ĐĐ. Cụm bầy trả một lần khi con cuối ngã.
  - Hết đợt trả 25 %, mỗi đợt hơn đợt trước 10 %.
  - Hạ hết quái đã định thì trả đúng cả quỹ, không thừa không thiếu.
  - Học trước tối đa +40. Thẻ Ôn +10 Vàng và +2 XP mỗi câu đúng, tối đa 3 câu mỗi lần nghỉ.
- **Cửa hàng** (`src/sim/shop.ts`):
  - Có đặt, nâng cấp, bán, mua bình máu, Tim Rồng, Vảy Cứng.
  - Nâng cấp tốn 70 % rồi 100 % giá gốc.
  - Bán hoàn 70 %. Bán trong cùng lần nghỉ đã mua thì hoàn 100 %.
  - Trong đợt chỉ được uống Bình Máu Nhỏ, hồi chung 8 s.
  - Bấm `=` trên nhà Đổ Nát là sửa nhà, tốn 30 % giá. Việc này làm được cả trong đợt.
- **Bẫy** (`src/sim/traps.ts`):
  - Gai Chông làm chậm 25 % và đâm 8 VL mỗi giây.
  - Bom Hạt Thông nổ khi có từ 3 quái, gây 120 VL, đẩy lùi 2 m, nạp lại 22 s.
  - Lưới Phóng kéo quái bay thấp gần nhất xuống đất 3 s, nạp lại 15 s.
  - Cấp 2 mạnh hơn 45 %, cấp 3 mạnh thêm 35 % và nạp nhanh hơn 15 %.
  - Có Cộng Hưởng: đòn gõ trúng quái trong vùng bẫy rút ngắn thời gian nạp, tối đa 50 % mỗi lượt.
- **Lính** (`src/sim/units.ts`):
  - Vệ Binh Rêu chặn quái theo suất chặn. Quái không đủ chỗ đi qua với 50 % tốc.
  - Quái bay không bị chặn, trừ khi bị Hạ Cánh.
  - Sói vồ qua 1 lính, có báo trước 0,5 s.
  - Lính tự bước ra trong dây giữ 4 m, đánh 12 VL mỗi 1,2 s.
  - Lính hồi 4 % máu mỗi giây sau 3 s không bị đánh.
  - Lính ngã thì 14 s sau dậy lại. Hết đợt thì mọi lính dậy ngay.
- **Nhà** (`src/sim/houses.ts`):
  - Nhà Thuốc Lá hồi 1,5 % máu mỗi giây cho lính và hai Rồng. Rồng được tính tới mép Bệ Rồng.
  - Mỗi lần hạ quái bằng chữ trong vùng nhà được 1 Năng. Đủ 5 Năng thì phát Xung hồi 10 %.
  - Nhà hết máu thì Đổ Nát. Hết đợt nhà tự sửa 50 %.
- **Trạng thái** (`src/sim/status.ts`):
  - Có chậm, choáng, giam, đóng băng, Hạ Cánh, cháy, độc, đánh dấu, phá giáp, hăng.
  - Chậm lấy mức mạnh nhất, có trần.
  - Khống chế cứng giảm dần ×1, ×0,6, ×0,3, sau đó được Vững 4 s.
  - Thêm chặn trên cho cổng G15: khống chế cứng của ta lên một quái không quá 35 % của max(thời gian sống, 10 s).

## Kiểm tra

- 7 file test `tests/sim/ourside-*.test.ts` và 1 file fixture. Có 50 test, đều qua.
- Test chạy với combat và movement thật của làn sim-battle.
- Test ranh giới và test smoke đều qua. `tsc --noEmit` không lỗi.
- Phát lại một nhật ký lệnh của phe ta ra cùng mã băm `f6a468af` trên Node và trên Chrome. Trên Chrome có 0 lỗi console và 0 lần tải hỏng.
- Đo phe ta khi đỉnh 300 quái và đủ mọi ô: khoảng 0,08 ms mỗi tick. Ngân sách cả bước là 0,3 ms.
