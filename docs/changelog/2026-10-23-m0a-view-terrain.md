# 23/10/2026 · M0a: sa bàn rừng tranh vẽ cho L2-cau (làn view-terrain)

Làn view-terrain dựng cảnh đất, sông và camera cho bản đồ thử L2-cau. Mọi thứ là hình tạm hoặc thủ tục, chưa có model.

## Đã làm

- **Đất** (`src/view/terrain.ts`): lưới cao độ ô 0,5 m trong vùng chơi, thưa dần ra rìa tới 300 m. Đồi mềm, rừng vây ngoài vùng chơi. Đường làm phẳng, lòng sông khắc sâu, chỗ lội nông, ô nhà bằng phẳng. Màu đất vẽ trong shader theo độ cao, độ dốc và nhiễu nét cọ.
- **Nước** (`src/view/water.ts`): dải sông màu ngọc sẫm theo độ sâu, hai lớp gợn trôi, bọt ở bờ và chỗ lội, lấp lánh theo nắng.
- **Đường, cầu, ô đặt** (`src/view/paths.ts`): cầu gỗ ghép khối hộp, Đường Trời là dải mờ có mũi tên trôi về bệ. Ô bẫy vuông, ô chặn tròn, ô nhà lục giác, ẩn sẵn.
- **Cây, đá** (`src/view/scatter.ts`): thông là khối nón, cây tán và bụi là khối cầu. Rải theo seed, tránh đường, sông, ô, bệ. Cây che đường thì hiện thưa 35 %.
- **Camera** (`src/view/camera.ts`): FOV 30°, nghiêng 40–75°, xoay tự do, zoom 0,6–1,3 lần. Chuột phải kéo xoay, lăn chuột zoom, chuột giữa kéo dời. Phím theo bảng 00 §6: mũi tên, Alt + ↑/↓, Alt + 0. Camera không tự chạy. Rung tối đa 12 px chỉ dịch ảnh, thẻ chữ đứng yên.
- **Sân khấu** (`src/view/stage.ts`): nắng ấm có bóng mềm, sáng phụ lạnh, pass chỉnh màu, FXAA. `createMapStage` dựng cả cảnh; `?view=terrain` là trang chỉ xem cảnh.

## Kiểm

- 15 test của làn qua (cao độ, chỗ rải cây, camera, rung không làm lệch thẻ, phép chiếu).
- 12 góc chuẩn (3 độ nghiêng × 4 hướng) đều ra rừng tranh vẽ, không lộ mép thế giới.
- Đo riêng cảnh ở 1080p: Low 2,5 ms, Medium 3,1 ms, High 3,6 ms, Ultra 10,9 ms mỗi khung. Nên để mặc định là High.

## Còn thiếu

- Cầu, bệ, cây, đá đều là khối tạm, chờ GLB của chủ dự án.
- Chưa có LUT theo giờ, chưa có impostor, chưa nướng màu đất thành ảnh.
