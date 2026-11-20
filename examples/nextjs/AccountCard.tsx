'use client';

import { createElement, useEffect, useRef, type ReactNode } from 'react';
import type { AccountOverview, OverviewProfile, OverviewSyncOption } from '@xcenter-id/web';

export function AccountCard({ clientId, profile, signInPath = '/api/xcenter/start', signOut, syncOptions, children, styleNonce }: {
  clientId: string;
  profile: OverviewProfile | null;
  signInPath?: string;
  signOut?: () => void | Promise<void>;
  syncOptions?: readonly OverviewSyncOption[];
  children?: ReactNode;
  styleNonce?: string;
}) {
  const element = useRef<AccountOverview>(null);
  useEffect(() => {
    let current = true;
    void import('@xcenter-id/web').then(() => {
      const card = element.current;
      if (!current || !card) return;
      card.signOut = signOut;
      card.syncOptions = syncOptions ?? [];
      card.profile = profile;
    });
    return () => { current = false; };
  }, [profile, signOut, syncOptions]);
  return createElement('xcenter-account-overview', { ref: element, 'client-id': clientId, 'start-path': signInPath, 'style-nonce': styleNonce },
    children && createElement('div', { slot: 'settings' }, children));
}
