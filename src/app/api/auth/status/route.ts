import { NextResponse } from 'next/server';
import { getValidTokens } from '@/lib/yahoo';

export async function GET() {
  const tokens = await getValidTokens().catch(() => null);
  return NextResponse.json({ authenticated: Boolean(tokens) });
}
