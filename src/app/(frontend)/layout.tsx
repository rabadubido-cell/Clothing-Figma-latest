import React from 'react'
import type { Metadata, Viewport } from 'next'
import './styles.css'

const defaultTitle = 'Threadline Operations'
const description =
  'Inventory and procurement management for a single-location online clothing business.'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: defaultTitle,
  description,
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f6f5f1] text-stone-950 antialiased">
        <div id="root" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  )
}
