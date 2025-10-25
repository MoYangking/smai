# SMAI - Smithery API 代理

一个基于 Node.js 的 Smithery API 代理服务，支持 OpenAI 兼容接口和 Cookie 轮询管理。

## 🆕 新功能

### 🍪 Cookie 轮询管理
- **Cookie 池管理**: 支持添加多个 Cookie 到池中
- **自动轮换**: 当当前 Cookie 失败时自动切换到下一个
- **手动控制**: 支持手动轮换和随机选择 Cookie
- **状态监控**: 实时查看 Cookie 池状态和使用情况

### 🏗️ 模块化架构
- **代码重构**: 将原本臃肿的 server.js 拆分为多个模块
- **易于维护**: 清晰的模块结构，便于后期维护和扩展
- **功能分离**: 配置、路由、日志、Cookie 管理等功能独立

### ☁️ Vercel 部署支持
- **无服务器部署**: 支持 Vercel 无服务器函数部署
- **自动配置**: 包含完整的 Vercel 配置文件
- **生产就绪**: 优化的部署配置

## 项目结构

```
smai/
├── src/                    # 源代码目录
│   ├── server.js          # 主服务器逻辑
│   ├── config.js          # 配置管理
│   ├── cookieManager.js   # Cookie 管理器
│   ├── store.js           # 数据存储
│   ├── logger.js          # 日志系统
│   ├── utils.js           # 工具函数
│   ├── openaiConverter.js # OpenAI 格式转换
│   ├── sseHandler.js      # SSE 流处理
│   ├── modelsManager.js   # 模型管理
│   ├── routes.js          # API 路由
│   └── adminRoutes.js     # 管理路由
├── api/                   # Vercel API 目录
│   └── index.js
├── public/                # 静态文件
│   └── admin.html
├── data/                  # 数据存储目录
├── server.js              # 入口文件
├── config.json            # 配置文件
├── package.json           # 项目配置
├── Dockerfile             # Docker 配置
├── vercel.json           # Vercel 配置
└── README.md             # 说明文档
```

## 安装和运行

### 本地运行

1. 确保已安装 Node.js (>= 18.0.0)
2. 克隆项目并进入目录
3. 启动服务：

```bash
npm start
```

服务将在 `http://localhost:8787` 启动。

### Docker 部署

1. 构建镜像：

```bash
docker build -t smai .
```

2. 运行容器：

```bash
mkdir -p data
docker run -d \
  --name smai \
  -p 8787:8787 \
  -v $(pwd)/data:/app/data \
  smai
```

要修改配置，可将自定义 `config.json` 挂载到容器：

```bash
docker run -d \
  --name smai \
  -p 8787:8787 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/config.json:/app/config.json:ro \
  smai
```

### Vercel 部署

1. 安装 Vercel CLI：

```bash
npm i -g vercel
```

2. 部署到 Vercel：

```bash
vercel --prod
```

## API 接口

### OpenAI 兼容接口

- `POST /v1/chat/completions` - 聊天完成接口
- `GET /v1/models` - 获取模型列表
- `POST /v1/models/refresh` - 刷新模型列表

### Cookie 管理接口

- `GET /admin/cookies` - 获取当前 Cookie
- `POST /admin/cookies` - 设置当前 Cookie

### 🆕 Cookie 池管理接口

- `GET /admin/cookie-pool` - 获取 Cookie 池状态
- `POST /admin/cookie-pool/add` - 添加 Cookie 到池
- `DELETE /admin/cookie-pool/remove?cookie=xxx` - 从池中移除 Cookie
- `POST /admin/cookie-pool/rotate` - 轮换到下一个 Cookie
- `POST /admin/cookie-pool/random` - 随机选择 Cookie
- `DELETE /admin/cookie-pool/clear` - 清空 Cookie 池

### 管理接口

- `GET /admin/config` - 获取配置
- `POST /admin/config` - 更新配置
- `GET /admin/logs` - 获取日志
- `POST /admin/logs/clear` - 清空日志
- `POST /admin/models/add` - 手动添加模型
- `POST /admin/models/clear` - 删除模型文件

## 配置说明

配置文件 `config.json` 支持以下选项：

```json
{
  "port": 8787,              // 服务端口
  "debug": false,            // 调试模式
  "heartbeatMs": 15000,      // 心跳间隔（毫秒）
  "flushIntervalMs": 40,     // 刷新间隔（毫秒）
  "autoResumeMax": 1,        // 自动恢复最大次数
  "dataDir": "./data"        // 数据目录
}
```

## 🍪 Cookie 轮询机制

### 自动轮换
当请求失败时，系统会：
1. 检测失败原因
2. 从 Cookie 池中移除失败的 Cookie
3. 自动切换到下一个可用的 Cookie
4. 重试请求（最多 3 次）

### 手动控制
通过管理接口可以：
- 查看当前 Cookie 池状态
- 手动添加/删除 Cookie
- 手动轮换或随机选择 Cookie
- 清空整个 Cookie 池

### 使用示例

```bash
# 添加 Cookie 到池
curl -X POST http://localhost:8787/admin/cookie-pool/add \
  -H "Content-Type: application/json" \
  -d '{"cookies": "session1=abc123; auth1=def456"}'

# 查看池状态
curl http://localhost:8787/admin/cookie-pool

# 手动轮换
curl -X POST http://localhost:8787/admin/cookie-pool/rotate
```

## 管理界面

访问 `http://localhost:8787/admin` 可以通过 Web 界面管理服务配置和 Cookie 池。

## 注意事项

1. **数据持久化**: 所有数据（配置、Cookie、模型列表、日志）都存储在 `data` 目录中
2. **安全性**: Cookie 包含敏感信息，请妥善保管 `data` 目录
3. **性能**: Cookie 轮换会增加少量延迟，但能显著提高服务可用性
4. **兼容性**: 完全兼容 OpenAI API 格式，可直接替换现有 OpenAI 客户端

## 更新日志

### v2.0.0
- ✨ 添加 Cookie 轮询管理功能
- 🏗️ 重构代码结构，提高可维护性
- ☁️ 支持 Vercel 无服务器部署
- 🐳 优化 Docker 配置
- 📝 完善文档和说明

### v1.0.0
- 🎯 初始版本，基于文件存储的 Smithery Node 代理
- 🔄 支持 OpenAI 兼容接口
- 📦 Docker 部署支持
