// @/components/admin/StatusBadge.tsx
import { CheckCircle2, XCircle, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export function StatusBadge({ status, size = 'sm', showIcon = true }: StatusBadgeProps) {
  const config: Record<string, { label: string; color: string; icon: LucideIcon }> = {
    active: { label: 'Active', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
    verified: { label: 'Verified', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: ShieldCheck },
    banned: { label: 'Banned', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
    suspended: { label: 'Suspended', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
    pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: Clock },
    processing: { label: 'Processing', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
    failed: { label: 'Failed', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
    refunded: { label: 'Refunded', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: CheckCircle2 },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
    disputed: { label: 'Disputed', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
    shipped: { label: 'Shipped', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
    paid_held: { label: 'Escrow', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: ShieldCheck },
    under_review: { label: 'Under review', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
    resolved_refund: { label: 'Refund resolved', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle2 },
    resolved_vendor: { label: 'Seller paid', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
    closed: { label: 'Closed', color: 'bg-gray-100 text-gray-600 border-gray-200', icon: CheckCircle2 },
    refund_pending: { label: 'Refund pending', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: Clock },
  };

  const { label, color, icon: Icon } = config[status.toLowerCase()] || config.pending;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider border ${color} ${sizeClasses}`}>
      {showIcon && <Icon size={size === 'sm' ? 10 : 12} />}
      {label}
    </span>
  );
}
