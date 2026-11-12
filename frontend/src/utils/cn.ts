import { clsx, type ClassValue } from 'clsx'

/** Conditional class-name helper used by every component. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
