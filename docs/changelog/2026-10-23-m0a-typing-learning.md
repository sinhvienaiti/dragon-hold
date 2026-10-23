# 23/10/2026 · M0a: gõ chữ và học trong trận

Làn gõ và học của mốc M0a. Quái mang từ, người chơi gõ để Hỏa Long phun lửa, khung học hiện nghĩa và gửi sự kiện học.

## Đã làm

- **Gán từ cho quái** (`src/sim/words.ts`, 01 §3.2–3.6, 00 §5):
  - Mỗi 0,25 s, quái chưa có từ trong Vùng Chữ 26 m được xếp theo đe dọa. Lượt 1 cho mỗi đường có quái trong 20 m một từ. Lượt 2 chia theo đe dọa.
  - Ngân sách chữ: N_max = min(16, A − 3), 2 suất khẩn cho quái trong Vòng Nguy, quái đang niệm và tướng.
  - Từ đã gắn không đổi tới khi quái chết, không hết hạn. Cả bầy kiến dùng chung một từ; con mang từ chết thì từ sang con khác trong bầy.
  - Chữ đầu riêng cho mọi từ sống, chữ vừa trả nghỉ 1 s, giữ 3 chữ dự trữ, không hai từ cách nhau một lần sửa. Tầng 2 chỉ là dự phòng.
  - Độ dài từ theo tốc độ E của người chơi và loại quái (bảng 01 §3.4). Thiếu từ thì rút dải xuống 1 chữ.
  - Từ mới chỉ lên quái nhỏ, vừa, đi chậm, còn ≥ 14 m; tối đa 2 mỗi đợt, 8 mỗi ải. Quái mang từ mới đi chậm 15 % (`wordSlowPct`, làn movement đọc).
- **Khóa và gõ:** khóa mềm theo chữ đầu, đổi khóa không phạt sau 1 chữ, Backspace, Esc nhả khóa. Bảo hộ khóa 1,2 s tính từ đòn chí mạng đầu tiên. Mất khóa thì không phạt, phím lạc kế tiếp được tha.
- **Chấm và Chuỗi:** Chớp ×1,25, Hoàn hảo ×1,10, Tốt ×1,00, Vừa ×0,90, Ẩu ×0,60. Chuỗi 5 bậc tới ×1,16. Từ đặc biệt gõ tốt +2. Không có chí mạng ngẫu nhiên.
- **Từ đặc biệt M0:** Ấn Phá là từ thứ 3, 6… của G01, gõ xong thì tắt hào quang. Từ Khẩn mỗi đợt một lần khi ≥ 3 quái trong Vòng Cận hoặc Hỏa Long dưới 35 % máu, gõ xong là Long Hống. Từ nhổ cờ cho cờ của G01.
- **Thẻ chữ** (`src/ui/tags.ts`): DOM theo từng khung, bộ xếp không bao giờ chồng thẻ, tránh khung học và HUD. Đẩy ngang, nâng tối đa 3 bậc có vạch nối, rồi thu khung 85 %. Vòng khe quanh bệ, chip ở mép màn khi quái ra ngoài khung nhìn. Icon theo loại từ, chip "MỚI", nghĩa tối đa 4 thẻ, chữ đã gõ màu xanh ngọc. Chữ 20 px ở 1080p, 16 px ở 720p.
- **Khung học** (`src/ui/learning-frame.ts`): từ, IPA, nghĩa theo số lần nhớ đúng (không theo độ thuộc thô). Ghim 2,5 s cho từ mới và từ yếu, 0,8 s cho từ khác. Dòng "Vừa học" giữ 3 từ mới. Không rung, không bị hiệu ứng đè.
- **Học trước và Thẻ Ôn:** bảng Học trước 8 từ mới, bảng Thẻ Ôn tối đa 3 câu (nghe rồi gõ, xem nghĩa rồi gõ).
- **Lõi học** (`src/app/learning.ts`): nạp từ `/vocabulary/`, lọc từ nhạy cảm, hỏi portal (chờ 2 s) rồi dựng bộ 70–100 từ. Mỗi từ chỉ gửi một sự kiện có chấm mỗi ải, chỉ gõ không lỗi mới là đúng. Gửi theo lô 5 s, khi hết đợt, hết ải, đóng tab. Không có portal thì xếp hàng cục bộ. Một kênh phát âm, cách nhau ≥ 2,5 s. Tab nghe lại.

## Kiểm

- Test của làn: `tests/typing-words.test.ts` (21), `tests/typing-learning.test.ts` (14), `tests/typing-tags.test.ts` (10). Test ranh giới vẫn qua.
- Trình duyệt (khung thử trong `tmp/`, cổng 3213): 1280×720 và 1920×1080, thẻ không chồng nhau, không đè khung học và HUD, chữ nhỏ nhất 16 px và 20 px, 0 lỗi console, 0 tải hỏng.
