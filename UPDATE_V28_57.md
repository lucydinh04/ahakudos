# UPDATE_V28_57

## Cấu trúc homepage mới
- **Định nghĩa** đưa lên thành block full-width ở đầu phần handbook.
- Chuyển câu **“AHAKUDOS là chương trình ghi nhận văn hóa và không thay thế hệ thống đánh giá hiệu suất.”** xuống cuối phần Định nghĩa.
- **Mục tiêu + Nguồn KUDOS** được gom chung thành chặng **Mục tiêu** trên progress bar và hiển thị thành **2 card song song** bên dưới.
- Thanh progress rút từ **4 mốc xuống 3 mốc**:
  1. Định nghĩa
  2. Mục tiêu
  3. Gửi KUDOS
- Logic progress đổi thành **1/3 → 2/3 → 3/3** khi click từng mốc.

## Kiểm tra
- `node tools/check-build.mjs`: PASS
- `npm run build`: PASS
