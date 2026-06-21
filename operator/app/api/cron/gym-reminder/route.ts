import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import GymReminderEmail from '@/components/emails/GymReminderEmail';
import { getGymData } from '@/lib/gymData';

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');

export async function GET() {
  try {
    const gymData = getGymData('default-user');
    const today = gymData.today;

    if (!today) {
      return NextResponse.json({ error: 'No workout found for today.' }, { status: 404 });
    }

    const displayDate = new Date(today.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    const htmlContent = await render(
      GymReminderEmail({
        dayType: today.dayType,
        muscleFocus: today.muscleFocus,
        exercises: today.exercises,
        dateStr: displayDate,
      })
    );

    const recipient = process.env.RECIPIENT_EMAIL || 'youremail@example.com';

    const emailResponse = await resend.emails.send({
      from: 'VERA Gym <onboarding@resend.dev>',
      to: [recipient],
      subject: `Morning Reminder: ${today.dayType.toUpperCase()} DAY (${displayDate})`,
      html: htmlContent,
    });

    if (emailResponse.error) {
       return NextResponse.json({ error: emailResponse.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: emailResponse.data?.id });
  } catch (error: any) {
    console.error('Error sending gym reminder email:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
