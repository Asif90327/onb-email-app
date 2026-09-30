import { NextResponse } from 'next/server';

let mockMailsStore: any[] = [];

export async function GET() {
  return NextResponse.json({ mails: mockMailsStore });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (Array.isArray(body.mails)) {
      mockMailsStore = body.mails;
    }
    return NextResponse.json({ success: true, count: mockMailsStore.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
  }
}
