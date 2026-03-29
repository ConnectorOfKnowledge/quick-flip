import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  id?: string;
}

export default function Input({ label, id, className = '', ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm text-qf-text-muted font-medium">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full px-3 py-3 rounded-lg border border-qf-border bg-qf-surface
          text-qf-text placeholder:text-qf-text-muted/60
          focus:outline-none focus:ring-2 focus:ring-qf-primary/30 focus:border-qf-primary
          transition-colors duration-150 min-h-[44px]
          ${className}
        `}
        {...props}
      />
    </div>
  );
}
