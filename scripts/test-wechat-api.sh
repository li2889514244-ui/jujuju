#!/bin/bash
TOKEN=$(curl -s "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wx172981cd31cf8016&secret=bee06b83e34090719059e391f30e5ee6" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token','ERROR'))")

echo "=== 1. 佣金单详情 ==="
curl -s -X POST "https://api.weixin.qq.com/channels/ec/talent/get_order_detail?access_token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"3736514860993107456","sku_id":"9611686348"}'

echo ""
echo ""
echo "=== 2. 橱窗商品详情 ==="
curl -s -X POST "https://api.weixin.qq.com/channels/ec/talent/window/product/get?access_token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"14000690038536"}'
