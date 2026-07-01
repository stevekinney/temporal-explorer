import type { Page } from '@playwright/test';

export function collectBrowserErrors(page: Page): () => void {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  return () => {
    if (errors.length > 0) {
      throw new Error(`Unexpected browser error(s):\n${errors.join('\n')}`);
    }
  };
}
