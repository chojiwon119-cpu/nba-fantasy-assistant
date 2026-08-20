import { NextResponse } from 'next/server';
import { apiError, requireYahooTokens } from '@/lib/api';
import { fetchLeagues } from '@/lib/yahoo';

export async function GET() {
  try {
    const tokens = await requireYahooTokens();
    return NextResponse.json({ leagues: await fetchLeagues(tokens) });
  } catch (error) {
    return apiError(error);
  }
}
