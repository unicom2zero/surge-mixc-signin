# 一点万象 Surge 自动签到

打开一点万象签到页后自动刷新登录凭据，每天检查签到状态，仅在尚未签到时提交签到。

## 安装

在 Surge iOS 中通过 URL 安装模块：

```text
https://raw.githubusercontent.com/unicom2zero/surge-mixc-signin/main/MixcSignIn.sgmodule
```

安装并启用后：

1. 确认 Surge 的 MitM 和脚本功能已开启，并已安装、信任 Surge CA 证书。
2. 打开一次“一点万象 -> 签到”页面，凭据刷新脚本会自动保存当前登录信息。
3. 在 Surge 脚本列表运行“一点万象手动签到”进行验证。

## 行为

- 默认每天 08:30 自动执行。
- 自动任务会先查询状态，已签到时不会重复提交。
- 登录失效时会发送 Surge 通知；重新登录并打开签到页即可刷新凭据。
- 登录 Token、Cookie 和设备信息只保存在 Surge `$persistentStore`，不会上传到 GitHub 或写入脚本文件。

## 文件

- `MixcSignIn.sgmodule`：Surge 模块入口。
- `mixc_capture.js`：从网关请求中刷新凭据。
- `mixc_signin.js`：查询状态并执行签到。

该项目仅供个人学习与自动化使用，接口变化时可能需要更新。
