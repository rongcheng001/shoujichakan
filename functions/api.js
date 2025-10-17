import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

// 初始化 Supabase 客户端
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 工具函数：格式化活动时间
function formatActivityTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays === 1) return '昨天';
  if (diffDays === 2) return '前天';
  return `${diffDays}天前`;
}

// 工具函数：获取角色中文名
function getRoleText(role) {
  const roles = {
    'super_admin': '超级管理员',
    'admin': '管理员',
    'employee': '员工'
  };
  return roles[role] || role;
}

// 主处理函数
export async function handler(event, context) {
  // 设置 CORS 头
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // 处理预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  const path = event.path.replace('/.netlify/functions/api', '');
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  console.log(`API请求: ${method} ${path}`);

  try {
    // 健康检查
    if (path === '/health' && method === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: '荣诚商家移动管理端 API 运行正常',
          timestamp: new Date().toISOString()
        })
      };
    }

    // 管理员登录
    if (path === '/admin/login' && method === 'POST') {
      const { email, password } = body;
      
      if (!email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '请输入邮箱和密码' 
          })
        };
      }

      // 查询超级管理员
      const { data: admin, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .single();

      if (error || !admin) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '管理员账户不存在或已被禁用' 
          })
        };
      }

      // 验证密码
      const validPassword = await bcrypt.compare(password, admin.password_hash);
      if (!validPassword) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '密码错误' 
          })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '登录成功',
          user: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role
          }
        })
      };
    }

    // 获取仪表盘数据
    if (path === '/dashboard/data' && method === 'POST') {
      const { email, password } = body;
      
      if (!email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '需要认证信息' 
          })
        };
      }

      // 验证管理员身份
      const { data: admin, error: authError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .single();

      if (authError || !admin) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '认证失败' 
          })
        };
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 并行查询所有数据
      const [
        totalStoresResult,
        totalUsersResult,
        todayStoresResult,
        activeStoresResult,
        platformDistributionResult,
        recentActivitiesResult
      ] = await Promise.all([
        // 总门店数
        supabase.from('stores').select('*', { count: 'exact', head: true }),
        // 总用户数
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true),
        // 今日新增门店
        supabase.from('stores').select('*', { count: 'exact', head: true })
          .gte('created_at', todayStart.toISOString()),
        // 活跃门店（最近7天有更新）
        supabase.from('stores').select('*', { count: 'exact', head: true })
          .gte('updated_at', sevenDaysAgo.toISOString()),
        // 平台分布
        supabase.from('stores').select('platform'),
        // 最近活动（新增门店）
        supabase.from('stores')
          .select('id, name, platform, created_at, owner_id')
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      // 处理平台分布
      const platformDistribution = {};
      if (platformDistributionResult.data) {
        platformDistributionResult.data.forEach(store => {
          platformDistribution[store.platform] = (platformDistribution[store.platform] || 0) + 1;
        });
      }

      // 处理最近活动
      let recentActivities = [];
      if (recentActivitiesResult.data && recentActivitiesResult.data.length > 0) {
        // 获取用户信息
        const userIds = [...new Set(recentActivitiesResult.data.map(store => store.owner_id))];
        const { data: users } = await supabase
          .from('users')
          .select('id, name')
          .in('id', userIds);

        const userMap = {};
        users?.forEach(user => {
          userMap[user.id] = user;
        });

        recentActivities = recentActivitiesResult.data.map(store => {
          const user = userMap[store.owner_id];
          const createTime = new Date(store.created_at);
          
          return {
            time: formatActivityTime(createTime),
            content: `${user?.name || '用户'}创建了${store.platform}门店「${store.name}」`,
            timestamp: createTime.getTime()
          };
        });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: {
            summary: {
              total_stores: totalStoresResult.count || 0,
              total_users: totalUsersResult.count || 0,
              today_new_stores: todayStoresResult.count || 0,
              active_stores: activeStoresResult.count || 0
            },
            platform_distribution: Object.entries(platformDistribution)
              .map(([platform, count]) => ({ platform, count }))
              .sort((a, b) => b.count - a.count),
            recent_activities: recentActivities,
            timestamp: now.toISOString()
          }
        })
      };
    }

    // 获取用户列表
    if (path === '/users/list' && method === 'POST') {
      const { email, password } = body;
      
      // 验证管理员身份
      const { data: admin, error: authError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .single();

      if (authError || !admin) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '认证失败' 
          })
        };
      }

      const { data: users, error } = await supabase
        .from('users')
        .select('id, name, email, role, store_limit, is_active, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('获取用户列表错误:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '获取用户列表失败' 
          })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: users || []
        })
      };
    }

    // 创建用户
    if (path === '/users/create' && method === 'POST') {
      const { email: adminEmail, password: adminPassword, ...userData } = body;
      const { name, email, password, role, store_limit } = userData;
      
      // 验证管理员身份
      const { data: admin, error: authError } = await supabase
        .from('users')
        .select('id')
        .eq('email', adminEmail)
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .single();

      if (authError || !admin) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '认证失败' 
          })
        };
      }

      // 数据验证
      if (!name || !email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '请填写所有必填字段' 
          })
        };
      }

      if (password.length < 6) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '密码长度至少6位' 
          })
        };
      }

      // 检查邮箱是否已存在
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '邮箱已被使用' 
          })
        };
      }

      // 加密密码
      const hashedPassword = await bcrypt.hash(password, 10);

      // 创建用户
      const { data: newUser, error } = await supabase
        .from('users')
        .insert([{
          name,
          email,
          password_hash: hashedPassword,
          role: role || 'employee',
          store_limit: store_limit || 10,
          is_active: true,
          created_by: admin.id
        }])
        .select()
        .single();

      if (error) {
        console.error('创建用户错误:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '创建用户失败: ' + error.message 
          })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '用户创建成功',
          data: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            store_limit: newUser.store_limit
          }
        })
      };
    }

    // 未找到的路由
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: '接口不存在',
        path: path,
        method: method
      })
    };

  } catch (error) {
    console.error('API处理错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: '服务器内部错误: ' + error.message 
      })
    };
  }
}
