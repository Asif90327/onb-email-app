import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const mail = await request.json();
    console.log(`[DUMMY BACKEND] Processing email delivery:`, {
      id: mail.id,
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      sendAt: new Date(mail.sendAt).toLocaleString(),
    });

    // Simulate dummy backend processing latency (e.g. SMTP/Resend API call)
    await new Promise((resolve) => setTimeout(resolve, 150));

    return NextResponse.json({
      success: true,
      message: `Mail to ${mail.to} delivered successfully via ONB Dummy Backend`,
      deliveredAt: Date.now(),
      mailId: mail.id,
    });
  } catch (error) {
    console.error(`[DUMMY BACKEND] Delivery failed:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to process email delivery' },
      { status: 500 }
    );
  }
}
