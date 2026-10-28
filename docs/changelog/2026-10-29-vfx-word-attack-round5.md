# 29/10/2026 · VFX bước 1a, vòng 5: lõi nóng cộng sáng có lớp tối bên dưới, khối tụ lửa phát sáng báo trước đòn mạnh, lóe chạm, PERFECT

Làn V-dh, nhánh `dh-vfx` trong `games/.wt-dh-vfx`. Máy, trình duyệt và luật làn như vòng 4. Vite `127.0.0.1:4141 --strictPort`, mọi lệnh nặng qua `.local/bin/heavy.sh`; khung thô của mỗi lượt được dọn ngay khi tờ khung đã ghép.

Người chấm độc lập vòng 4 (`tmp/vfx/judge-r4/verdict.md`) cho **đòn mạnh 6,5, đòn thường 6,0** (cổng 8, không pha nào dưới 7). Điểm theo pha (mạnh / thường): A 5,0 / 5,0; R 6,5 / 6,0; T 7,25 / 6,75; I 7,25 / 6,75; F 5,9 / 5,4.

Nhận xét gốc của người chấm: mỗi lớp trông như một tấm cắt màu cam phẳng; không có lõi sáng rực, không có lớp tối làm nền. Trên nền sáng, vùng nổ còn tối đi (0,646 → 0,552), vùng miệng gần như không sáng thêm lúc tung đòn (0,631 → 0,633). Người chấm truy ra gốc ở mục 2.7 của vòng 4 ("lửa nguội hơn"): lõi nóng phải đi bằng cộng sáng HDR, chỉ ở ≤ 30 % bán kính, còn thân cam giữ trộn thường. Số của chính làn cũng khớp: lóe tung đòn chỉ 1,22 lần đầu đạn (chuẩn ≥ 1,5); `scorch.drop` trên nền tối 0,03–0,10, âm ở cận cảnh tối.

**Về tone map:** cả khung đi qua lượt grade (Neutral rồi tách tông, `view/stage.ts`), nên không có vật liệu nào "bỏ qua tone map" được nếu không sửa `stage.ts` (ngoài làn). Lõi nóng vì vậy là lớp **cộng sáng HDR 2–4** chồng lên thân trộn thường: Neutral nén nó về trắng vàng ở giữa, mép vẫn cam. Màu đào của vòng 2 sinh ra khi lớp cộng sáng lớn phủ lên bệ màu be; lớp cộng sáng vòng 5 chỉ ở lõi, nằm trên thân lửa và lớp muội.

**Sim không đổi.** Không sửa `src/sim`, `src/content`, `src/typing`, `tests/sim`, `src/kit`; không đụng `layout.ts`, `scatter.ts`, `paint.ts`, `models.ts`, `stage.ts` hay mã bẫy. Golden giữ nguyên.

**Sky Fire** dừng ở điểm commit sạch `7aa0180` (mã `cc0f5ad`, changelog `2026-10-28-vfx-skyfire.md` ghi trạng thái).

## 1. Tóm tắt

KẾT_QUẢ

## 2. Đã sửa (`src/view/fx.ts`, `vfx-layers.ts`, `fx-palette.ts`)

### 2.1 R: ba lớp và lóe miệng lớn

- **Lõi nóng:** một dải lửa cộng sáng (shader lửa của kit, HDR) chạy dọc trục luồng lửa, rộng ≤ 30 % bề ngang nón, và một dải mảnh lệch góc. Đủ 2 khung, tắt ở khung 5.
- **Thân:** vỏ nón trộn thường, bị nhiễu ăn, nay dùng cả dải màu: vàng ở gốc, cam, đỏ về phía mũi; tắt trong 8 khung. Một khối lửa có viền ở chỗ luồng rời mõm, hai lưỡi lửa trộn thường.
- **Lớp tối:** 3 đám muội ở gốc và hai mép nón, hiện từ khung 2, tan ở khung 8.
- **Lóe miệng:** lõi trắng 1,0 m × k trong lóe cam 3,4 m × k, đủ sáng 2 khung, vẽ trước đầu Rồng; thêm một quầng vàng rộng 5,0 m × k, thấp, 2 khung, để cả vùng miệng sáng lên so với lúc gồng.
- **Đèn miệng** lúc tung đòn 70 → 110 cd (chiếu sáng bệ); lúc gồng giữ 8 % của mức đó.
- 9 tia kéo dài (đòn thường 5).
- **Đòn thường:** cùng ba lớp, cỡ 0,65, độ nóng 0,9 (vòng đầu thử 0,72 thì lúc tung đòn tối hơn lúc gồng ở ô lóe).

### 2.2 I: lõi cộng sáng, lóe chạm, khối đục nhỏ lại

- **Lóe chạm 1 khung** khi đầu đạn tới quái (f010–f011), vẽ về phía camera; đầu đạn ở 25 % cuối đường bay cũng vẽ về phía camera, nên không lặn vào thân quái.
- **Khối đục** bằng 0,75 cỡ cú nổ và mỏng đi từ khung 2, để thấy quái lóe và giật.
- **Lõi cộng sáng HDR:** lõi trắng 0,28 cỡ cú nổ (≤ 30 % bán kính) trong quầng cam 0,75 cỡ, đủ 2 khung, nằm trên khối lửa.
- **Muội sau lưng khối lửa** từ khung 2.
- **Đòn thường có vòng riêng:** một vòng cam mảnh trên đất, 10 khung, khoảng 0,6 tầm vòng xanh ngọc của đòn mạnh.

### 2.3 A: khối tụ lửa phát sáng, báo trước đòn mạnh

- Một **lõi cộng sáng** lớn dần theo chữ (0,4 → 1,2 m × √k) trong **quầng cam rộng 2,75 lần lõi**, đặt trước đầu; dưới đó là hạt lửa nhỏ có viền tối; lưỡi lửa liếm lên.
- **Từ nửa từ trở đi, nếu từ chưa có lỗi, lõi chuyển dần sang xanh ngọc:** đòn mạnh được báo trước. Từ có lỗi giữ lõi vàng. Đây là chỗ khác nhau của đòn mạnh và đòn thường ở pha A.
- **2–3 đốm than mỗi chữ** bay vào miệng từ khoảng 60 px ngoài ở camera chơi 1080p, thành tia kéo dài.
- **Đốm sao lạc bên trái miệng** mà người chấm thấy là đốm T0 của mỗi phím, trước đây bay *ra* từ miệng tới quái. Giờ nó bay từ thẻ chữ của quái *vào* miệng, như §3.3 dòng "Phím gõ" ("đốm bay từ thẻ về nguồn").

### 2.4 T: đầu đạn ở miệng từ khung 0, vệt mảnh hơn

- Đầu đạn và vệt có ngay từ khung 0, nằm trong lóe miệng.
- Vệt mảnh hơn (0,5 m × k; đòn thường 0,36), mép bị nhiễu ăn mạnh hơn, thon về 0 ở đuôi. Than vẫn rơi dọc vệt (khoảng 8 đốm mỗi 10 khung).

### 2.5 F: viền tro và khe than HDR

- Vết cháy đen giữ nguyên tâm, thêm **viền tro xám** quanh mép: sáng hơn cỏ tối, tối hơn cỏ nắng, nên đọc được trên cả hai nền.
- **Khe than HDR** nguội trong 1,5 s: lớp vàng giữ 0,2 s rồi tắt ở 0,7 s, lớp đỏ giữ 0,6 s rồi tắt ở 1,5 s.
- **3–5 đốm than bay lên** trong 1–1,5 s; muội và khói xám như vòng 4.

### 2.6 Số sát thương và nhãn

- Số xuất phát ở đỉnh đầu quái cộng 0,15 m (vòng 4: 0,7 m, cao hơn đầu một thân quái); bộ số của kit nảy rồi bay lên.
- Nhãn trên số của đòn mạnh là **"PERFECT"** (luật tiếng Anh của 28/10), qua một bản sao hồ sơ `DRAGON` ở phía view; không sửa kit.

## 3. Số đo (§5.6)

SỐ_ĐO

## 4. Hiệu năng

HIỆU_NĂNG

## 5. Tờ khung và clip

TỜ_KHUNG

## 6. Bản giảm chuyển động (§3.8)

Như vòng 4; thêm: lõi nóng và quầng của khối tụ ×0,7; lõi cộng sáng của cú nổ và lóe miệng ×0,6; dải lửa cộng sáng ×0,6.

## 7. Còn mở

CÒN_MỞ
