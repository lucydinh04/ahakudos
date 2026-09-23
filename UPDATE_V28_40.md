# UPDATE V28.40

## Nội dung cập nhật

### 1) Hồ sơ KUDOS > tab Đã nhận > trạng thái trống
- Thay card empty cũ bằng layout mới dùng mascot remove background.
- Tăng kích thước mascot lớn hơn.
- Copy mới:
  - **Chưa có Kudos nào**
  - `Khi đồng nghiệp gửi lời ghi nhận, bạn sẽ thấy ở đây.`
  - CTA: **Gửi Kudos ngay →**

### 2) Trang chủ > trạng thái chưa gửi KUDOS nào
- Khôi phục block bên phải: **First Kudos để nhận quà**.
- Khi user chưa gửi KUDOS:
  - bên trái vẫn là block **Gửi KUDOS đầu tiên** + hướng dẫn 3 bước
  - bên phải là block **First Kudos** với CTA gửi KUDOS
- Khi user đã gửi KUDOS:
  - block bên phải vẫn là card **Chúc mừng bạn!** như logic cũ.

## Ghi chú
- Không thay đổi Apps Script.
- Chỉ cần redeploy Vercel.
