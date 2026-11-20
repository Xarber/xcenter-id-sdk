import { issuer, manageAppURL, safePhotoURL, signInURL } from './urls.js';

const css = `
  :host{display:block;color-scheme:light dark;--xc-ink:#141b2e;--xc-muted:#526078;--xc-panel:#fff;--xc-hero:#e9f0ff;--xc-line:#dee4ee;--xc-accent:#214fbe;--xc-danger:#a42635;font:inherit;color:var(--xc-ink)}
  @media(prefers-color-scheme:dark){:host{--xc-ink:#f3f6ff;--xc-muted:#b1c1dc;--xc-panel:#192132;--xc-hero:#23355d;--xc-line:#33415a;--xc-accent:#9ebcff;--xc-danger:#ffa8ad}}
  section,dialog{box-sizing:border-box;border:1px solid var(--xc-line);border-radius:20px;padding:16px;background:var(--xc-hero);color:var(--xc-ink)}
  dialog{width:min(92vw,36rem);max-height:85dvh;overflow:auto;background:var(--xc-panel)}
  dialog::backdrop{background:#10152280}
  h2,p{margin:0;overflow-wrap:anywhere}h2{font-size:1.2rem}p{color:var(--xc-muted)}
  .brand,.identity,.actions,label{display:flex;align-items:center;gap:10px}.actions{flex-wrap:wrap}
  .brand{font-weight:750}.brand img{width:30px;height:30px;border-radius:8px}
  .identity>div{min-width:0}.identity img,.avatar{width:48px;height:48px;flex:none;border-radius:50%;object-fit:cover}
  .avatar{display:grid;place-items:center;background:var(--xc-panel);color:var(--xc-accent)}
  section,dialog[open],.copy,.badges{display:grid;gap:10px}.badges{display:flex;flex-wrap:wrap}
  small{padding:3px 8px;border:1px solid var(--xc-line);border-radius:99px;color:var(--xc-accent);background:var(--xc-panel)}
  a,button{box-sizing:border-box;display:inline-flex;align-items:center;min-height:44px;width:fit-content;max-width:100%;padding:8px 12px;font:inherit;font-weight:650;border:1px solid var(--xc-line);border-radius:10px;color:var(--xc-accent);background:var(--xc-panel);text-decoration:none;cursor:pointer}
  a:active,button:active{opacity:.7}button:disabled{opacity:.6;cursor:default}.danger{color:var(--xc-danger)}
  label{justify-content:space-between;border-top:1px solid var(--xc-line);padding-block:9px}
  input{min-width:24px;min-height:24px;accent-color:var(--xc-accent)}
`;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export class AccountOverview extends HTMLElement {
  #profile = null;
  #options = [];
  #busy = false;
  #error = '';
  #details = false;
  #opener;

  static observedAttributes = ['client-id', 'start-path', 'style-nonce'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() { this.#render(); }
  attributeChangedCallback() { this.#render(); }

  set profile(value) {
    if (!value) this.#details = false;
    this.#profile = value;
    this.#render();
  }
  get profile() { return this.#profile; }

  set syncOptions(value) {
    this.#options = value ?? [];
    this.#render();
  }

  #action(title, handler, className) {
    const button = node('button', title, className);
    button.type = 'button';
    button.disabled = this.#busy;
    button.addEventListener('click', handler);
    return button;
  }

  async #run(operation, message) {
    if (this.#busy) return;
    this.#busy = true;
    this.#error = '';
    for (const button of this.shadowRoot.querySelectorAll('button')) button.disabled = true;
    try { await operation(); }
    catch { this.#error = message; }
    finally {
      this.#busy = false;
      this.#render();
    }
  }

  #identity(profile) {
    const identity = node('div', '', 'identity');
    const fallback = node('span', (profile.name || profile.username || '?').slice(0, 1), 'avatar');
    fallback.setAttribute('aria-hidden', 'true');
    const url = safePhotoURL(profile.picture, location.origin);
    if (url) {
      const image = node('img');
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.replaceWith(fallback), { once: true });
      image.src = url;
      identity.append(image);
    } else identity.append(fallback);
    const copy = node('div', '', 'copy');
    copy.append(node('h2', profile.name || profile.username), node('p', '@' + profile.username));
    if (profile.email) copy.append(node('p', profile.email));
    const badges = node('div', '', 'badges');
    if (profile.verified) badges.append(node('small', 'Verified profile'));
    if (profile.administrator) badges.append(node('small', 'Administrator'));
    if (badges.childElementCount) copy.append(badges);
    identity.append(copy);
    return identity;
  }

  #link(title, url) {
    const link = node('a', title);
    link.href = url;
    return link;
  }

  #render() {
    if (!this.isConnected) return;
    const style = node('style', css);
    const nonce = this.getAttribute('style-nonce');
    if (nonce) style.nonce = nonce;
    const card = node('section');
    const brand = node('div', 'X-Center ID', 'brand');
    const icon = node('img');
    icon.alt = '';
    icon.src = new URL('./xcenter-id-mark.png', import.meta.url).href;
    brand.prepend(icon);
    card.append(brand);
    const profile = this.#profile;
    if (!profile) {
      card.append(node('p', 'Sign in or create an account'));
      const path = this.getAttribute('start-path');
      if (this.signIn || path) card.append(this.#action('Continue with X-Center ID', () => this.#run(
        () => this.signIn ? this.signIn() : location.assign(signInURL(path, location.origin)), 'Could not sign in.'
      )));
    } else {
      card.append(this.#identity(profile), this.#action('Manage account & data →', () => {
        this.#details = true;
        dialog.showModal();
      }));
      this.#opener = card.lastElementChild;
    }
    const dialog = node('dialog');
    dialog.setAttribute('aria-label', 'Manage account and data');
    dialog.addEventListener('close', () => {
      if (!dialog.isConnected) return;
      this.#details = false;
      this.#opener?.focus();
    });
    if (profile) {
      const links = node('div', '', 'actions');
      links.append(this.#link('Open dashboard', issuer + '/dashboard'));
      const clientId = this.getAttribute('client-id');
      if (clientId) links.append(this.#link('Manage app', manageAppURL(clientId)));
      if (this.signOut) links.append(this.#action('Sign out', () => this.#run(() => this.signOut(), 'Could not sign out.'), 'danger'));
      dialog.append(this.#action('Back to settings', () => dialog.close()), this.#identity(profile), links);
      for (const option of this.#options) {
        const label = node('label');
        const description = node('span', option.label);
        if (option.description) description.append(node('p', option.description));
        const toggle = node('input');
        toggle.type = 'checkbox';
        toggle.checked = option.enabled;
        toggle.disabled = Boolean(option.disabled);
        toggle.addEventListener('change', () => {
          const enabled = toggle.checked;
          toggle.checked = option.enabled;
          toggle.disabled = true;
          void this.#run(() => option.onChange(enabled), 'Could not update this setting.');
        });
        label.append(description, toggle);
        dialog.append(label);
      }
      const settings = node('slot');
      settings.name = 'settings';
      dialog.append(settings);
    }
    const error = node('p', this.#error);
    error.setAttribute('role', 'alert');
    (this.#details ? dialog : card).append(error);
    this.shadowRoot.replaceChildren(style, card, dialog);
    if (profile && this.#details) dialog.showModal();
  }
}

if (!customElements.get('xcenter-account-overview')) {
  customElements.define('xcenter-account-overview', AccountOverview);
}
