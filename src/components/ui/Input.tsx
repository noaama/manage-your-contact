import React from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type = 'text', ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            className="block text-sm font-medium text-gray-700"
            htmlFor={props.id}
          >
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-red-500 focus:ring-red-500",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-500 mt-1">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;