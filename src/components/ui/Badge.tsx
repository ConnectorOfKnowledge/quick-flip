import React from 'react';

type BadgeVariant = 'default' | 'success' | 'danger' | 'warn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-qf-primary/10 text-qf-primary',
  success: 'bg-qf-accent/10 text-qf-accent',
  danger: 'bg-qf-danger/10 text-qf-danger',
  warn: 'bg-qf-warn/10 text-qf-warn',
};

export default function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
