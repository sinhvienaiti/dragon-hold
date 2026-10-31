# 30/10/2026 · Nút trên màn tựa cùng một hàng (lỗi nhỏ trình duyệt của 235)

- **Lỗi:** khi bộ từ lỗi, nút **Retry** trên màn tựa cao hơn **Start**: 92×56 so với 90×44 ở 1280, 111×72 so với 109×48 ở 1920. Ảnh `retry` nằm chồng trên chữ, mép trên hai nút lệch nhau 24 px. Nguyên nhân: `.dh-title__menu .dh-btn { display:inline-block }` gặp `.dh-btn img { display:block }` của `dh.css`.
- **Sửa** (`src/ui/styles/title.css`, chỉ trong `.dh-title__menu`): nút trên màn tựa dùng `inline-flex`, `align-items:center`, `justify-content:center`, `gap:0.45em` và `vertical-align:top`. Ảnh trong nút có cỡ `1em`, không cao hơn dòng chữ 1.15. Nếu thiếu `vertical-align:top`, hai nút inline-flex canh theo baseline của mục đầu, tức đáy ảnh ở Retry và dòng chữ ở Start, nên Retry vẫn lệch 2–3 px. Nút ở HUD, thẻ đợt, kết quả và các màn khác không đổi.
- **Test:** `tests/ui/title-css.test.ts` thêm 3 test. Test đọc CSS thật và tính cascade đơn giản: tổ tiên, `>`, độ ưu tiên, thử cả hai thứ tự nạp `dh.css`/`title.css`.
  - Start, Retry và Back to portal dùng chung `inline-flex`, canh giữa, cùng hộp và cùng `vertical-align:top`.
  - Ảnh Retry có cỡ theo `em`, không vượt `line-height`.
  - Mọi luật trong `title.css` chỉ nằm dưới gốc màn tựa; nút `.dh-btn` ở màn khác giữ nguyên.
  - Trước khi sửa, 2 test đầu đỏ; test chặn `vertical-align` được thêm sau đó và cũng đỏ trước khi sửa. 5 đột biến đều làm đỏ test tương ứng: bỏ giới hạn ảnh, về `inline-block`, bỏ phạm vi của luật ảnh, hạ độ ưu tiên, bỏ `vertical-align`.
- **Trình duyệt** (dev 4148, bộ từ bị chặn trong iframe cùng gốc để màn tựa ở trạng thái lỗi thật): Start và Retry đều cao 44 px, mép trên ở y 396 khi 1280×720 (`--ui` 0.8). Khi 1920×1080 (`--ui` 1.2), cả hai cao 48,3 px, mép trên ở y 594. Ảnh nằm giữa nút (lệch 0) và đã tải xong. Nút `.dh-btn` ngoài màn tựa vẫn là `inline-block`, ảnh trong đó vẫn `block`. Không lưu frame nào.
