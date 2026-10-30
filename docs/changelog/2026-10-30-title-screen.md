# Dragonhold · Màn tựa kiêm màn tải (DH-13, phiếu 197)

Màn tựa đứng trước thẻ tốc độ. Start chỉ bật sau khi bộ từ, model đám đông, mặt đất và hai rồng tải xong; lỗi bộ từ hiện thông báo của 195 và giữ Start tắt. Cổng game có điều kiện, chuột và các phím mũi tên/Enter dùng cùng bộ định tuyến; Esc giữ màn tựa. `?title=0` giữ luồng cũ cho kịch bản.

Ba mục `title-backdrop`, `logo`, `emblem` được thêm vào `ui-art.json`, đều `accepted: null`. Script chỉ xuất mục `art` đã nhận, giữ alpha, thu Lanczos và không phóng to; `--check` kiểm cùng manifest của icon. Chưa xuất ảnh title vào public. Thiếu ảnh dùng nền tối phẳng, chữ Dragonhold bằng Cormorant Garamond và ẩn huy hiệu, mỗi tên ảnh cảnh báo một lần.

Chừa `title.quickSlot` cho 192 và các móc `onShow`, `onHide`, `isOpen`, `setBackdrop("art" | "live")` cho camera R2. Nút dùng `.dh-btn` hiện có, chờ gắn khung 162. Chưa nghiệm thu hiển thị trong trình duyệt; Claude kiểm 1280×720 và 1920×1080 theo báo cáo 197 ở repo cha.
