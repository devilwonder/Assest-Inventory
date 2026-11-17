import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MinusCircle,
  ShieldAlert,
  Wrench,
} from 'lucide-react';

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const STATUS_TONES: Record<string, Tone> = {
  Available: 'success',
  Active: 'success',
  Complete: 'success',
  Completed: 'success',
  Assigned: 'info',
  'Manager Approved': 'info',
  'IT Approved': 'info',
  'In Progress': 'info',
  New: 'success',
  Good: 'info',
  Fair: 'warning',
  Purchased: 'info',
  Pending: 'warning',
  Requested: 'warning',
  'Under Maintenance': 'warning',
  'On Leave': 'warning',
  High: 'warning',
  Poor: 'warning',
  Damaged: 'danger',
  Lost: 'danger',
  Rejected: 'danger',
  Terminated: 'danger',
  Unrepairable: 'danger',
  Urgent: 'danger',
  Resigned: 'warning',
  Retired: 'neutral',
  Disposed: 'neutral',
  Returned: 'neutral',
  'Not Applicable': 'neutral',
  Normal: 'neutral',
  Low: 'neutral',
};

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
};

function renderToneIcon(tone: Tone, label: string) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  if (label === 'Under Maintenance' || label === 'In Progress') return <Wrench className={cls} aria-hidden="true" />;
  if (tone === 'success') return <CheckCircle2 className={cls} aria-hidden="true" />;
  if (tone === 'warning') return <Clock className={cls} aria-hidden="true" />;
  if (tone === 'danger') return <ShieldAlert className={cls} aria-hidden="true" />;
  if (tone === 'info') return <AlertCircle className={cls} aria-hidden="true" />;
  return <MinusCircle className={cls} aria-hidden="true" />;
}

export const StatusBadge: React.FC<{ label: string; toneOverride?: Tone }> = ({
  label,
  toneOverride,
}) => {
  const tone = toneOverride || STATUS_TONES[label] || 'neutral';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md border whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {renderToneIcon(tone, label)}
      <span>{label}</span>
    </span>
  );
};
