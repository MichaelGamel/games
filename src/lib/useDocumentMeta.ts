import { useEffect } from 'react'

interface DocumentMeta {
  /** The full document title for the route, e.g. "Ludo — Robin's Games". */
  title: string
  /** The meta description for the route (omit to leave the existing one). */
  description?: string
}

/**
 * Per-route SEO. Sets `document.title`, the meta description, and points the
 * canonical link at the current `origin + pathname`. Open Graph and Twitter
 * title/description mirrors are kept in sync so link unfurls match the route.
 *
 * No dependency: it simply upserts the tags the static `index.html` already
 * ships. Crawlers that don't run JS still read those static tags; this keeps
 * the in-tab title and the canonical URL correct as the SPA navigates.
 */
export function useDocumentMeta({ title, description }: DocumentMeta): void {
  useEffect(() => {
    document.title = title
    upsertMeta('property', 'og:title', title)
    upsertMeta('name', 'twitter:title', title)

    if (description) {
      upsertMeta('name', 'description', description)
      upsertMeta('property', 'og:description', description)
      upsertMeta('name', 'twitter:description', description)
    }

    const url = window.location.origin + window.location.pathname
    upsertLink('canonical', url)
    upsertMeta('property', 'og:url', url)
  }, [title, description])
}

/** Find a `<meta>` by name/property, creating it in `<head>` if absent, then set its content. */
function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/** Find a `<link>` by rel, creating it in `<head>` if absent, then set its href. */
function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}
