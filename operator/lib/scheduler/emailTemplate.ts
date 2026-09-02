export type MissionEmailKind = 'task' | 'check-in' | 'confirmation';

export interface MissionEmailInput {
  kind: MissionEmailKind;
  eyebrow: string;
  headline: string;
  objective: string;
  timeLabel: string;
  modeLabel: string;
  directive: string;
  details?: string;
  priorityLabel?: string;
  questions?: string[];
  scheduleLabel?: string;
  progress?: {
    completed: number;
    total: number;
    percent: number;
    items: Array<{
      title: string;
      timeLabel: string;
      status: 'planned' | 'completed' | 'skipped';
      modeLabel: string;
    }>;
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function multiline(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br/>');
}

export function formatTime12(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function renderMissionEmail(input: MissionEmailInput): string {
  const status = input.kind === 'task'
    ? 'MISSION ACTIVE'
    : input.kind === 'check-in'
      ? 'FOCUS CHECKPOINT'
      : 'CHANNEL CONFIRMED';
  const questions = input.questions?.length
    ? `
      <tr>
        <td style="padding:0 32px 28px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#0b0e0b;border:1px solid #2e3728">
            <tr><td style="padding:18px 20px 8px;font:700 10px Arial,sans-serif;letter-spacing:2px;color:#a7c957">FIELD QUESTIONS</td></tr>
            ${input.questions.map((question, index) => `
              <tr>
                <td style="padding:8px 20px 10px;font:14px/1.55 Arial,sans-serif;color:#d9ddd3">
                  <span style="display:inline-block;width:24px;color:#a7c957;font-weight:700">0${index + 1}</span>${escapeHtml(question)}
                </td>
              </tr>
            `).join('')}
            <tr><td style="height:8px"></td></tr>
          </table>
        </td>
      </tr>
    `
    : '';
  const progress = input.progress
    ? (() => {
      const percent = Math.max(0, Math.min(100, Math.round(input.progress.percent)));
      return `
        <tr>
          <td class="pad" style="padding:0 32px 24px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#0b0e0b;border:1px solid #2e3728">
              <tr>
                <td style="padding:18px 20px 6px;font:700 10px Arial,sans-serif;letter-spacing:2px;color:#a7c957">LOCKED PLAN PROGRESS</td>
                <td align="right" style="padding:18px 20px 6px;font:800 18px Arial,sans-serif;color:#d8ff3e">${percent}%</td>
              </tr>
              <tr>
                <td colspan="2" style="padding:5px 20px 8px">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#242b20">
                    <tr><td width="${percent}%" style="height:10px;background:#d8ff3e;font-size:0;line-height:0">&nbsp;</td><td style="height:10px;font-size:0;line-height:0">&nbsp;</td></tr>
                  </table>
                </td>
              </tr>
              <tr><td colspan="2" style="padding:0 20px 15px;font:12px Arial,sans-serif;color:#89927e">${input.progress.completed} of ${input.progress.total} objectives completed</td></tr>
              ${input.progress.items.map((item) => `
                <tr>
                  <td colspan="2" style="padding:11px 20px;border-top:1px solid #242b20">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                      <tr>
                        <td width="28" style="font:800 15px Arial,sans-serif;color:${item.status === 'completed' ? '#d8ff3e' : item.status === 'skipped' ? '#d66b5d' : '#89927e'}">${item.status === 'completed' ? '✓' : item.status === 'skipped' ? '×' : '○'}</td>
                        <td style="font:700 13px/1.45 Arial,sans-serif;color:${item.status === 'completed' ? '#89927e' : '#eef1e8'};${item.status === 'completed' ? 'text-decoration:line-through;' : ''}">${escapeHtml(item.title)}</td>
                        <td align="right" style="font:700 10px Arial,sans-serif;color:#89927e">${escapeHtml(item.timeLabel)} · ${escapeHtml(item.modeLabel)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              `).join('')}
            </table>
          </td>
        </tr>
      `;
    })()
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>VIRA Mission Brief</title>
    <style>
      @media only screen and (max-width: 620px) {
        .shell { width: 100% !important; }
        .pad { padding-left: 20px !important; padding-right: 20px !important; }
        .metric { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#070907;color:#f1f3ed">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.headline)} — ${escapeHtml(input.objective)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#070907">
      <tr>
        <td align="center" style="padding:32px 12px">
          <table class="shell" role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:600px;border-collapse:collapse;background:#111510;border:1px solid #343d2d">
            <tr>
              <td class="pad" style="padding:22px 32px;border-bottom:1px solid #343d2d">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                  <tr>
                    <td style="font:800 21px Arial,sans-serif;letter-spacing:7px;color:#d8ff3e">VIRA</td>
                    <td align="right" style="font:700 9px Arial,sans-serif;letter-spacing:2px;color:#77806d">OPERATION CONTROL</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:30px 32px 20px">
                <div style="font:700 9px Arial,sans-serif;letter-spacing:2.4px;color:#d6a84b">${escapeHtml(input.eyebrow)} // EYES ONLY</div>
                <div style="margin-top:13px;font:800 31px/1.08 Arial,sans-serif;letter-spacing:-0.7px;color:#f4f5ef">${escapeHtml(input.headline)}</div>
                <div style="margin-top:18px;display:inline-block;padding:7px 10px;border:1px solid #a7c957;font:700 9px Arial,sans-serif;letter-spacing:1.8px;color:#c9ef68">${status}</div>
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:0 32px 22px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#171d14;border-left:4px solid #d8ff3e">
                  <tr><td style="padding:20px 22px 7px;font:700 9px Arial,sans-serif;letter-spacing:2px;color:#89927e">PRIMARY OBJECTIVE</td></tr>
                  <tr><td style="padding:0 22px 21px;font:800 22px/1.25 Arial,sans-serif;color:#ffffff">${escapeHtml(input.objective)}</td></tr>
                </table>
              </td>
            </tr>
            ${progress}
            <tr>
              <td class="pad" style="padding:0 32px 22px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                  <tr>
                    <td class="metric" width="50%" style="padding:15px 18px;background:#0b0e0b;border:1px solid #2e3728">
                      <div style="font:700 9px Arial,sans-serif;letter-spacing:1.8px;color:#737d6b">TIME WINDOW</div>
                      <div style="margin-top:7px;font:700 14px Arial,sans-serif;color:#f1f3ed">${escapeHtml(input.timeLabel)}</div>
                    </td>
                    <td width="10"></td>
                    <td class="metric" width="50%" style="padding:15px 18px;background:#0b0e0b;border:1px solid #2e3728">
                      <div style="font:700 9px Arial,sans-serif;letter-spacing:1.8px;color:#737d6b">OPERATING MODE</div>
                      <div style="margin-top:7px;font:700 14px Arial,sans-serif;color:#d8ff3e">${escapeHtml(input.modeLabel)}${input.priorityLabel ? ` · ${escapeHtml(input.priorityLabel)}` : ''}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:0 32px 22px">
                <div style="font:700 9px Arial,sans-serif;letter-spacing:2px;color:#d6a84b">COMMAND DIRECTIVE</div>
                <div style="margin-top:9px;font:700 17px/1.5 Arial,sans-serif;color:#eef1e8">${multiline(input.directive)}</div>
                ${input.details ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid #2e3728;font:13px/1.65 Arial,sans-serif;color:#aeb5a7">${multiline(input.details)}</div>` : ''}
              </td>
            </tr>
            ${questions}
            <tr>
              <td class="pad" style="padding:0 32px 30px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#d8ff3e">
                  <tr>
                    <td align="center" style="padding:16px 20px">
                      <a href="http://127.0.0.1:3100/scheduler" style="display:block;font:800 11px Arial,sans-serif;letter-spacing:2px;color:#11150d;text-decoration:none">OPEN DAILY COMMAND →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="pad" style="padding:20px 32px;background:#0b0e0b;border-top:1px solid #2e3728">
                <div style="font:700 10px/1.6 Arial,sans-serif;letter-spacing:1.8px;color:#89927e">DISCIPLINE IS THE MEMORY OF PURPOSE.</div>
                <div style="margin-top:5px;font:10px/1.5 Arial,sans-serif;color:#586052">${escapeHtml(input.scheduleLabel ?? 'Private system · Asia/Kolkata · VIRA Daily Command')}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
