# HTML and web frameworks

Serve this directory as modules, or install the package from this checkout. Import `@xcenter-id/web` in browser code only. See [the HTML example](../../examples/html.html) or [React and Next.js](../../examples/nextjs).

```html
<xcenter-account-overview client-id="registered-client-id" start-path="/api/xcenter/start">
  <div slot="settings"><!-- Your product settings --></div>
</xcenter-account-overview>
<script type="module" src="/xcenter/account-overview.js"></script>
```

Set `element.profile` to null for the signed-out state or assign a normalized profile from your product's authenticated session. Set `element.signOut` to an async handler that signs out of the product and sets `profile = null`. Supply `syncOptions` with `label`, `description`, `enabled`, `disabled` and `onChange(enabled)`. Update the options after persistence. Use the `settings` slot for app-specific UI. Optionally set `element.signIn` if the product has its own secure sign-in launcher. Keep the module client-side when using SSR. Use `style-nonce` if your site's style policy requires a CSP nonce.

Vue, Svelte, Angular and Lit applications can use the same element and DOM properties. Mount it in Settings, pass the authenticated session profile by property, and call product code to save changes and sign out. Configure your framework to treat this tag as a custom element if necessary. The element starts sign-in only after a user action and only redirects to a same-origin HTTPS backend route.
