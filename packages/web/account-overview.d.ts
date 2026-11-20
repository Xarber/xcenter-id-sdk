export type OverviewProfile = {
  name: string;
  username: string;
  picture?: string;
  email?: string;
  verified?: boolean;
  administrator?: boolean;
};

export type OverviewSyncOption = {
  label: string;
  description?: string;
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void | Promise<void>;
};

export class AccountOverview extends HTMLElement {
  profile: OverviewProfile | null;
  syncOptions: readonly OverviewSyncOption[];
  signIn?: () => void | Promise<void>;
  signOut?: () => void | Promise<void>;
}

declare global {
  interface HTMLElementTagNameMap {
    'xcenter-account-overview': AccountOverview;
  }
}
