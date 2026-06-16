import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.YAHOO_CLIENT_ID!;
  const redirectUri = encodeURIComponent(process.env.YAHOO_REDIRECT_URI!);
  const authUrl =
    `https://api.login.yahoo.com/oauth2/request_auth` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&language=en-us`;
  return NextResponse.redirect(authUrl);
}