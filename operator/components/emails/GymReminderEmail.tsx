import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface GymReminderProps {
  dayType: string;
  muscleFocus: string;
  exercises: string[];
  dateStr?: string;
}

export const GymReminderEmail = ({
  dayType = 'Pull Day',
  muscleFocus = 'Lat Width, Back Thickness, Biceps',
  exercises = ['1. Pull-Ups - 4xMax', '2. Barbell Curl - 4x8-15'],
  dateStr = 'Today',
}: GymReminderProps) => {
  return (
    <Html>
      <Head />
      <Preview>Your 6:30 AM Gym Reminder: {dayType.toUpperCase()} ({dateStr})</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Morning Agent - 44 today's target</Heading>
          <Text style={text}>
            Here is your workout for <b>{dateStr}</b>.
          </Text>
          <Hr style={hr} />
          
          <Section style={scheduleSection}>
            <Text style={scheduleTitle}>SCHEDULE:</Text>
            <Text style={scheduleItem}>• <b>7:15 AM - 9:00 AM</b>: Workout (1.45 hours total)</Text>
            <Text style={scheduleItem}>• <b>9:20 AM</b>: Must leave for the day!</Text>
          </Section>

          <Hr style={hr} />

          <Section style={workoutSection}>
            <Text style={workoutTitle}>{dayType.toUpperCase()} DAY</Text>
            {muscleFocus && (
              <Text style={workoutFocus}>{muscleFocus}</Text>
            )}
            
            <div style={exerciseList}>
              {exercises.length > 0 ? (
                exercises.map((ex, i) => (
                  <Text key={i} style={exerciseItem}>
                    <span style={bullet}>{i + 1}.</span> {ex.replace(/^\d+\.\s*/, '')}
                  </Text>
                ))
              ) : (
                <Text style={exerciseItem}>Rest day — Recovery, mobility, sleep.</Text>
              )}
            </div>
          </Section>

        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  marginBottom: '64px',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
  maxWidth: '600px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0 0 20px',
  letterSpacing: '2px',
};

const text = {
  color: '#555',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'center' as const,
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const scheduleSection = {
  padding: '16px',
  backgroundColor: '#fffbeb',
  borderRadius: '6px',
  borderLeft: '4px solid #f59e0b',
  marginBottom: '20px',
};

const scheduleTitle = {
  color: '#92400e',
  fontSize: '14px',
  fontWeight: 'bold',
  letterSpacing: '1px',
  margin: '0 0 8px 0',
};

const scheduleItem = {
  color: '#b45309',
  fontSize: '14px',
  margin: '4px 0',
};

const workoutSection = {
  padding: '24px',
  backgroundColor: '#111827',
  borderRadius: '6px',
};

const workoutTitle = {
  color: '#a3e635', // lime
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '0 0 4px 0',
  letterSpacing: '1px',
};

const workoutFocus = {
  color: '#9ca3af',
  fontSize: '12px',
  margin: '0 0 16px 0',
};

const exerciseList = {
  marginTop: '16px',
};

const exerciseItem = {
  color: '#f9fafb',
  fontSize: '14px',
  margin: '8px 0',
  lineHeight: '1.5',
  padding: '12px',
  backgroundColor: '#1f2937',
  borderRadius: '4px',
  border: '1px solid #374151',
};

const bullet = {
  color: '#a3e635',
  fontWeight: 'bold',
  marginRight: '8px',
};

export default GymReminderEmail;
