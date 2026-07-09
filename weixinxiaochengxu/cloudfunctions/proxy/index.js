// cloudfunctions/proxy/index.js
// 微信云函数：转发小程序请求到 MatrixFlow 后端
// 部署：在 cloudfunctions/proxy 目录右键「上传并部署：云端安装依赖」
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ traceUser: true })

const BACKEND = 'https://ddddkiii.com/api/v1'

exports.main = async (event) => {
  const { path = '/', method = 'GET', data = {}, headers = {} } = event
  try {
    const resp = await axios({
      url: BACKEND + path,
      method: method.toUpperCase(),
      data: method.toUpperCase() !== 'GET' ? data : undefined,
      params: method.toUpperCase() === 'GET' ? data : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: 15000,
    })
    return { status: resp.status, data: resp.data }
  } catch (err) {
    return {
      status: err.response ? err.response.status : 500,
      data: err.response ? err.response.data : { message: err.message },
    }
  }
}
