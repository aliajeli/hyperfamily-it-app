'use client'

import { type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { technologies } from '@/lib/about-presentation'

/** Credit tiles for the production technology stack; each opens the project site. */
export default function TechStackCard({ onExternal }: any) {
  return (
    <Card>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm">Production technology stack</CardTitle>
        <CardDescription className="mt-0 text-xs leading-snug">
          Core runtime, interface, data protection, native Agent, and Windows build tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-1">
        <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
          {technologies.map(({ name, description, brand, brandDark, url }: any, index) => (
            <motion.button
              key={name}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              whileHover={{ y: -4, scale: 1.03 }}
              whileTap={{ scale: 0.99 }}
              style={{ '--brand': brand, '--brand-dark': brandDark } as CSSProperties}
              /* A real <button>: the pointer cursor, keyboard focus and the
                 click are all native, and the click opens the project's own
                 website in the system browser. */
              onClick={() => url && onExternal(url)}
              title={`${description} — open ${name} in your browser`}
              aria-label={`${name}: ${description}. Opens ${url} in your browser`}
              className="tech-tile group relative min-w-0 cursor-pointer overflow-hidden rounded-xl border bg-[rgb(var(--surface)/.38)] px-2.5 py-2 text-left"
            >
              <span aria-hidden className="tech-tile-wash" />
              <b className="tech-tile-name relative block text-xs leading-snug">
                {name}
                <ExternalLink
                  size={9}
                  aria-hidden
                  className="ml-1 inline-block align-baseline opacity-0 transition-opacity duration-200 group-hover:opacity-70"
                />
              </b>
              <p className="relative mt-0.5 text-xs leading-snug text-[rgb(var(--muted))]">{description}</p>
            </motion.button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
