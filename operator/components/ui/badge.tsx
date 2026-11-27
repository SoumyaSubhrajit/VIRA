import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'muted';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight',
        variant === 'default' && 'bg-muted text-foreground',
        variant === 'success' && 'bg-emerald-500/10 text-emerald-600',
        variant === 'warning' && 'bg-amber-500/10 text-amber-600',
        variant === 'muted' && 'bg-muted text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
