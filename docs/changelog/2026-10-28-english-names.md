# Đổi tên danh từ sang tiếng Anh · Phiếu 051

Ngày 28/10/2026 · Worktree `games/.wt-dh-names`, nhánh `dh-names`, từ `e91c155`.

Đổi literal hiển thị theo `docs/games/NAMES_EN.md` của repo cha: 6 loài quái, Moss Bannerman, 8 món phe ta, Gold, Dragon Rage, Dragon Platform, Banner, Sky Fire, Dragon Roar; thêm Fire Breath và Inferno theo quyết định của Claude. Giữ tên riêng Hỏa Long, Bạch Long, Draconis, các nhãn cơ chế, chỉ số, mức Dễ và thẻ tốc độ bằng tiếng Việt.

Thêm nghĩa Việt trong ngoặc vào 7 mô tả thẻ ra mắt và 8 mô tả món đồ đang có. Câu gợi ý thua đổi tối thiểu thành “để Hỏa Long dùng Fire Breath hạ chúng”. Đồng bộ nhãn trong script báo cáo cân bằng và các assert được phép ở `tests/ui/{placement,shop-strip}.test.ts`; không sửa logic test.

**Chưa hoàn tất:** hàm `shortFoeName` còn phụ thuộc cấu trúc tên tiếng Việt; cần cho phép sửa tối thiểu hàm để giữ nguyên tên tiếng Anh đầy đủ trên thẻ đợt. Assert ở `tests/ui/hud.test.ts:73` cần đổi riêng literal, nhưng file nằm ngoài danh sách được phép ghi. Hai mục đã được hỏi lại chủ dự án; chưa sửa khi chưa có trả lời.

Kiểm hiện tại: `pnpm check` exit 1, 452/453 test đạt, chỉ assert HUD nêu trên lỗi; build chưa chạy vì test không đạt. Cả 10 test golden đạt; SHA-256 golden giữ nguyên; 1.438 id/khóa object trong `src/content/**` không đổi. Phép quét tên còn 3 literal ở 2 dòng của `shortFoeName`. Không cập nhật golden, không mở trình duyệt.

Không đụng cây chính, làn VFX, assets hay từ phải gõ. Báo cáo đầy đủ: `docs/codex-queue/051-report.md` trong repo cha. Claude kiểm trình duyệt sau khi xử lý hai mục còn lại, trước commit.
