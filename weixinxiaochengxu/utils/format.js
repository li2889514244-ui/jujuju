// utils/format.js - 数字格式化
function formatNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '0'
  const num = Number(n)
  if (num >= 1e8) return (num / 1e8).toFixed(2) + '亿'
  if (num >= 1e4) return (num / 1e4).toFixed(1) + '万'
  return String(num)
}

module.exports = { formatNum }
