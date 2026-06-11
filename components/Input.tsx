import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-900 mb-2">
          {label}
          {props.required && <span className="text-red-600"> *</span>}
        </label>
      )}

      <input
        className={`
          w-full px-4 py-2 border rounded-lg
          bg-white text-slate-900
          placeholder-slate-400
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-blue-500
          ${error ? 'border-red-600 focus:ring-red-500' : 'border-slate-300'}
          ${props.disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}
          ${className}
        `}
        {...props}
      />

      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      {hint && <p className="text-sm text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
