# UPDATE_V28_54

## Nội dung cập nhật
- Điều chỉnh **logic block hành trình KUDOS** ở trang chủ:
  - Nếu **chưa có KUDOS đã gửi và chưa có KUDOS đã nhận**:
    - block bên trái đổi thành nội dung khởi động hành trình KUDOS
    - block bên phải đổi thành nội dung **khuyến khích gửi KUDOS đầu tiên**
  - Nếu **đã gửi KUDOS đầu tiên**:
    - block **KUDOS đã gửi** đổi sang thông điệp **chúc mừng** và **chờ đón quà nhỏ đặc biệt**
  - Nếu **chưa nhận KUDOS nào** nhưng đã bắt đầu gửi:
    - block **KUDOS đã nhận** hiển thị nội dung chờ đồng nghiệp gửi lời ghi nhận.

## File chính thay đổi
- `private/workspace.html`
