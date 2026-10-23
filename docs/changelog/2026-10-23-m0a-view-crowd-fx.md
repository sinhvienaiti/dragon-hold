# 23/10/2026 · M0a: đám đông, hai Rồng, hiệu ứng, báo trước (làn view-crowd-fx)

Làn view-crowd-fx làm phần hình của trận: quái, phe ta, hai Rồng, hiệu ứng T0–T5 và báo trước đỏ. Bench đám đông làm trước.

## Đã làm

- **Đám đông** (`src/view/crowd.ts`): mỗi hình khối một InstancedMesh, cộng một lô bóng tròn. Dáng đi chạy trong shader: quái bay nhấp nhô, hai chân nảy lắc, bốn chân phi, bầy rung. Lóe trúng đòn, màu trạng thái, tan biến khi chết. Nhân vật vẽ to 1,4 lần. Quái Héo có vỏ xám tro và khe nứt vàng úa `#C8D24A`.
- **Diễn viên** (`src/view/actors.ts`): nội suy vị trí, quay mặt theo hướng đi, đứng đúng độ cao đất. Vẽ bẫy, nhà, lính từ thế giới.
- **Hai Rồng** (`src/view/heroes.ts`): Hỏa Long bay trên bệ, quay về quái đang khóa, đổi clip theo đòn. Bạch Long đứng cạnh dẫn đường. Bậc Low hoặc nạp lỗi thì giữ khối tạm.
- **Hiệu ứng** (`src/view/fx.ts`): cầu lửa bay từ miệng rồng, chạm đúng lúc có sự kiện trúng. Đòn Chớp và Hoàn hảo có đầu xanh ngọc. Mảnh vỡ theo chất liệu, dừng hình theo bậc T0–T5. Phím không bao giờ đi qua hiệu ứng.
- **Báo trước** (`src/view/telegraphs.ts`): báo trước của địch luôn đỏ `#FF4A4A`, đầy dần ít nhất 0,5 s. Thiên Hỏa của ta màu cam nhạt viền trắng.
- **Thanh máu** (`src/view/hpbars.ts`): một draw call; quái có thẻ chữ thì không có thanh riêng.
- **Bench** (`src/view/bench.ts`, `scripts/visual/scenarios/dh-bench.mjs`): 220 quái, đủ ba dáng đi và bầy.

## Kiểm

- 20 test của làn qua.
- Bench 220 quái trên nền tranh 1920 × 1080, bậc High: trung bình 4,6 ms, p95 6,8 ms, 36 draw call. Đích của M0 là trung bình ≤ 8 ms, p95 ≤ 12 ms.
- 0 lỗi console, 0 tải hỏng.

## Còn thiếu

- Đám đông có xương (`vat`, `bones`) mới có giao diện.
- Viêm Đế mới là vòng lửa tạm.
- Hiệu ứng chưa theo chế độ tua × 2.
