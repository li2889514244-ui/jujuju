import { registerAs } from '@nestjs/config'

export default registerAs('authing', () => {
  const appId = process.env.AUTHING_APP_ID
  const appSecret = process.env.AUTHING_APP_SECRET
  const host = process.env.AUTHING_HOST || ''

  // Redirect URI for OIDC callback (front-end route)
  const redirectUri = process.env.AUTHING_REDIRECT_URI || 'https://ddddkiii.com/auth/callback'

  return {
    appId,
    appSecret,
    host, // e.g. "xxxxx.authing.cn"
    redirectUri,
    enabled: !!(appId && appSecret && host),
  }
})
