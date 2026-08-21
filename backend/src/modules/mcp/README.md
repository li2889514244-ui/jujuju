# MatrixFlow MCP Server

This module exposes MatrixFlow data through a standard read-only MCP server.

## Endpoint

The Nest global prefix is `api/v1`, so MCP clients should connect to:

```text
POST https://<host>/api/v1/mcp
```

The endpoint uses the MCP Streamable HTTP transport in stateless JSON-response mode.
`GET` and `DELETE` return MCP JSON-RPC errors because the server does not keep sessions.

## Authentication

Set one or more bearer tokens before enabling the endpoint:

```env
MCP_API_KEYS=claude:change_me_32_bytes,cursor:another_secret
```

Requests must include:

```http
Authorization: Bearer change_me_32_bytes
```

If `MCP_API_KEYS` is not set, the endpoint returns `503` and no data is exposed.

Optional hardening:

```env
MCP_ALLOWED_ORIGINS=https://example.com,https://another-client.example
MCP_MAX_ROWS=500
MCP_MAX_RANGE_DAYS=366
```

Server-to-server MCP clients often do not send an `Origin` header. When no origin is present,
the request is allowed. When `MCP_ALLOWED_ORIGINS` is set and an origin is present, it must match.

## Resources

- `matrixflow://schema` - safe read-only table and field catalog.
- `matrixflow://metrics` - accepted metric, platform, and period values.

## Tools

- `list_accounts`
- `query_account_data`
- `get_top_rankings`
- `compare_accounts`
- `generate_report`
- `export_data`

All tools are read-only. The service never returns account cookies, OAuth tokens, proxy config,
or raw metadata.

## Example initialize request

```bash
curl -X POST https://<host>/api/v1/mcp \
  -H "Authorization: Bearer change_me_32_bytes" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "1.0.0" }
    }
  }'
```

## Example tool list request

```bash
curl -X POST https://<host>/api/v1/mcp \
  -H "Authorization: Bearer change_me_32_bytes" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }'
```
