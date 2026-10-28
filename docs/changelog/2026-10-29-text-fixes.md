# Sửa hai câu chữ của map 1 (29/10/2026)

## Thay đổi và lý do

Tên ải đầu đổi từ “Bản thử” thành “Ải 1”, giữ tên Cầu và Suối. Gợi ý khi
thua vì chưa gõ phím nào nay nói Hỏa Long phun lửa thường; `Fire Breath` vẫn
được giữ nguyên trong gợi ý nhánh Héo lan, nơi chiêu này được nhắc đúng chức
năng.

Test `starHint` kiểm câu mới ở nhánh `typing`.

## Số đo và kiểm tra

- Số dòng mã đổi: 2; số dòng test đổi: 1.
- Các chuỗi cũ `Bản thử` và `Fire Breath hạ` không còn trong `src/` và `tests/`.
- Không đổi golden. `pnpm check` không chạy vì lệnh gồm bộ test và build,
  hai việc bị cấm trong chỉ dẫn tác vụ tại phiên này.
- Chưa kiểm tra giao diện trong trình duyệt; Claude cần xem thẻ đợt và màn
  kết quả ở 1280 và 1920.
