// StatusChip – spec-aligned status display
const STATUS_MAP: Record<string, [string, string]> = {
  'Active': ['chip-success', 'Active'],
  'Idle': ['chip-neutral', 'Idle'],
  'Delayed': ['chip-danger', 'Delayed'],
  'Offline': ['chip-warning', 'Offline'],
  'active': ['chip-success', 'Active'],
  'idle': ['chip-neutral', 'Idle'],
  'delayed': ['chip-danger', 'Delayed'],
  'offline': ['chip-warning', 'Offline'],
};

export default function StatusChip({ status }: { status: string }) {
  const [cls, label] = STATUS_MAP[status] ?? ['chip-neutral', status];
  return <span className={`chip ${cls}`}>{label}</span>;
}