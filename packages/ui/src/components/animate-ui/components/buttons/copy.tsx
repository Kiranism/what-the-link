'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import * as React from 'react';

import { cn } from '@bookmark/ui/lib/utils';
import {
  Button as ButtonPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
} from '../../primitives/buttons/button';

const buttonVariants = cva(
  "flex items-center justify-center rounded-md transition-[box-shadow,_color,_background-color,_border-color,_outline-color,_text-decoration-color,_fill,_stroke] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        accent: 'bg-accent text-accent-foreground shadow-xs hover:bg-accent/90',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'size-9',
        xs: "size-7 [&_svg:not([class*='size-'])]:size-3.5 rounded-md",
        sm: 'size-8 rounded-md',
        lg: 'size-10 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type CopyButtonProps = Omit<ButtonPrimitiveProps, 'children'> &
  VariantProps<typeof buttonVariants> & {
    content: string;
    copied?: boolean;
    onCopiedChange?: (copied: boolean, content?: string) => void;
    delay?: number;
  };

function CopyButton({
  className,
  content,
  copied,
  onCopiedChange,
  onClick,
  variant,
  size,
  delay = 3000,
  ...props
}: CopyButtonProps) {
  const [internalCopied, setInternalCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const isCopied = copied || internalCopied;

  // Reset internal state when external `copied` turns off
  React.useEffect(() => {
    if (!copied) setInternalCopied(false);
  }, [copied]);

  const handleCopy = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      if (content) {
        navigator.clipboard
          .writeText(content)
          .then(() => {
            setInternalCopied(true);
            onCopiedChange?.(true, content);
            clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
              setInternalCopied(false);
              onCopiedChange?.(false);
            }, delay);
          })
          .catch((error) => {
            console.error('Error copying command', error);
          });
      }
    },
    [onClick, content, onCopiedChange, delay],
  );

  React.useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <ButtonPrimitive
      data-slot="copy-button"
      className={cn(buttonVariants({ variant, size, className }))}
      onClick={handleCopy}
      {...props}
    >
      <AnimatePresence mode="popLayout">
        <motion.span
          key={isCopied ? 'check' : 'copy'}
          data-slot="copy-button-icon"
          initial={{ scale: 0, opacity: 0.4, filter: 'blur(4px)' }}
          animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
          exit={{ scale: 0, opacity: 0.4, filter: 'blur(4px)' }}
          transition={{ duration: 0.25 }}
        >
          <Icon />
        </motion.span>
      </AnimatePresence>
    </ButtonPrimitive>
  );
}

export { buttonVariants, CopyButton, type CopyButtonProps };

