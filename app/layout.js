import './globals.css'
import AppProviders from '@/components/providers/AppProviders'

export const metadata = {
  title: 'HyperFamily Branch Monitor',
  description: 'Secure retail branch and device monitoring'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  )
}
