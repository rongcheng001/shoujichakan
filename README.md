# 荣诚商家移动管理端

基于 Netlify 部署的移动端管理平台，让超级管理员可以随时随地管理用户和查看系统状态。

## 功能特性

- 📱 响应式移动端界面
- 👥 用户管理（创建、查看）
- 📊 数据统计仪表盘
- 🔐 安全的身份验证
- 🌐 基于 Netlify 的免费部署

## 部署步骤

1. 将代码上传到 GitHub 仓库
2. 在 Netlify 中导入该仓库
3. 设置环境变量：
   - `SUPABASE_URL`: 你的 Supabase 项目 URL
   - `SUPABASE_SERVICE_KEY`: 你的 Supabase 服务端密钥
4. 部署完成！

## 环境变量

| 变量名 | 描述 | 示例 |
|--------|------|------|
| `SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase 服务端密钥 | `eyJ...` |

## API 接口

- `POST /api/admin/login` - 管理员登录
- `POST /api/dashboard/data` - 获取仪表盘数据
- `POST /api/users/list` - 获取用户列表
- `POST /api/users/create` - 创建用户

## 技术栈

- 前端: HTML5, CSS3, JavaScript
- 后端: Netlify Functions (Node.js)
- 数据库: Supabase
- 部署: Netlify